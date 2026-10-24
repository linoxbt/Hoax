// An in-memory venue that follows dreamDEX's documented perp rules closely
// enough to drive the watcher end to end: cross-margin equity and maintenance,
// IOC fills against a book around the mark, and liquidation that closes on the
// book in steps until the account is back above maintenance, charging up to
// the engine penalty out of the surplus. Used by the tests and the replay demo;
// nothing here claims to be the chain.

import type { BookLevel, LiquidationParams } from "@hoax/core";
import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";
import type {
  AccountEventHandlers,
  BookRead,
  FeedRead,
  IocOrder,
  LiquidationEvent,
  LiquidationScan,
  MarginRead,
  MarketInfo,
  PlaceResult,
  PositionRead,
  TradingSigner,
  Venue,
} from "./venue.ts";
import { TxRejectedError, TxRevertedError, TxUnknownError } from "./venue.ts";

export interface SimMarketState {
  info: MarketInfo;
  mark: bigint;
  markOk: boolean;
  /** Half the bid-ask spread, bps. */
  halfSpreadBps: number;
  /** Levels per side, each `levelStepBps` apart. */
  levels: number;
  levelStepBps: number;
  /** Raw base units resting at each level. */
  levelSize: bigint;
  /**
   * A real book's shape, as offsets from the mark: when set it replaces the
   * uniform levels above, so the simulation trades against recorded depth.
   */
  shape?: { bids: BookShapeLevel[]; asks: BookShapeLevel[] };
}

export interface BookShapeLevel {
  /** Distance from the mark, bps (positive = away from the mark). */
  offsetBps: number;
  quantity: bigint;
}

interface SimPosition {
  size: bigint;
  entry: bigint;
}

interface SimAccount {
  collateral: bigint;
  positions: Map<string, SimPosition>;
  operators: Set<string>;
}

const key = (a: string) => a.toLowerCase();

export class SimVenue implements Venue {
  readonly name = "simulation";
  readonly marginBank: Address = "0x000000000000000000000000000000000000ba11";
  private block = 1n;
  private nonce = 0n;
  private markets = new Map<string, SimMarketState>();
  private accounts = new Map<string, SimAccount>();
  private liquidations: LiquidationEvent[] = [];
  private watchers: Array<{ owners: Set<string>; handlers: AccountEventHandlers }> = [];
  readonly balances = new Map<string, bigint>();
  /** Orders other actors send in the same block as the next Hoax order (race tests). */
  beforeNextOrder: (() => void) | null = null;
  /**
   * Make the next order fail the way a real chain can (fault tests):
   * "reject" never sends it, "revert" mines a revert, "unknown" fills it but
   * loses the receipt (the wait times out), "unknown-dropped" sends it and it never lands.
   */
  nextOrderFault: "reject" | "revert" | "unknown" | "unknown-dropped" | null = null;
  /** Make the next sendNative lose its receipt after it lands. */
  nextSendUnknown = false;
  /** Builder approvals, keyed owner:builder, bps x 1000. */
  readonly approvals = new Map<string, bigint>();
  private results = new Map<string, PlaceResult | "reverted">();
  /** Per signer: nonces handed out, and those used on chain (mined, cancelled or reverted). */
  private nextNonce = new Map<string, number>();
  private usedNonces = new Map<string, Set<number>>();
  /** Orders stuck in the "mempool": they land if released, unless their nonce was cancelled. */
  private stuck = new Map<string, { nonce: number; signer: string; land: () => void }>();

  private takeNonce(signer: string): number {
    const n = this.nextNonce.get(key(signer)) ?? 0;
    this.nextNonce.set(key(signer), n + 1);
    return n;
  }

  private useNonce(signer: string, nonce: number): void {
    const used = this.usedNonces.get(key(signer)) ?? new Set<number>();
    used.add(nonce);
    this.usedNonces.set(key(signer), used);
  }

  /** For tests: a stuck order lands now (if its nonce was not cancelled first). */
  releaseStuck(): void {
    for (const [hash, s] of this.stuck) {
      this.stuck.delete(hash);
      if (!this.usedNonces.get(s.signer)?.has(s.nonce)) s.land();
    }
  }

  constructor(readonly liquidation: LiquidationParams = { penaltyBps: 100, minSpreadBps: 50 }) {}

  addMarket(state: SimMarketState): void {
    this.markets.set(key(state.info.pool), state);
  }

  market(pool: Address): SimMarketState {
    const m = this.markets.get(key(pool));
    if (!m) throw new Error(`unknown market ${pool}`);
    return m;
  }

  openAccount(owner: Address, collateral: bigint): void {
    this.accounts.set(key(owner), { collateral, positions: new Map(), operators: new Set() });
  }

  account(owner: Address): SimAccount {
    const a = this.accounts.get(key(owner));
    if (!a) throw new Error(`unknown account ${owner}`);
    return a;
  }

  link(owner: Address, operator: Address): void {
    this.account(owner).operators.add(key(operator));
  }

  /** Set a position directly, as if the trader had opened it at `entry`. */
  setPosition(owner: Address, pool: Address, size: bigint, entry: bigint): void {
    this.account(owner).positions.set(key(pool), { size, entry });
  }

  /** Move the mark; liquidates any account that falls under maintenance. */
  setMark(pool: Address, mark: bigint, markOk = true): void {
    const m = this.market(pool);
    m.mark = mark;
    m.markOk = markOk;
    this.block++;
    if (markOk) this.runLiquidations();
  }

  private oneBase(m: SimMarketState): bigint {
    return 10n ** BigInt(m.info.baseDecimals);
  }

  private equityOf(a: SimAccount): bigint {
    let eq = a.collateral;
    for (const [pool, p] of a.positions) {
      if (p.size === 0n) continue;
      const m = this.markets.get(pool)!;
      eq += (p.size * (m.mark - p.entry)) / this.oneBase(m);
    }
    return eq;
  }

  private reqOf(a: SimAccount, bpsOf: (m: SimMarketState) => number): bigint {
    let req = 0n;
    for (const [pool, p] of a.positions) {
      if (p.size === 0n) continue;
      const m = this.markets.get(pool)!;
      const n = ((p.size < 0n ? -p.size : p.size) * m.mark) / this.oneBase(m);
      req += (n * BigInt(bpsOf(m))) / 10_000n;
    }
    return req;
  }

  private mmOf(a: SimAccount): bigint {
    return this.reqOf(a, (m) => m.info.maintenanceMarginBps);
  }

  private book(m: SimMarketState): { bids: BookLevel[]; asks: BookLevel[] } {
    const tickSize = m.info.tickSize;
    if (m.shape) {
      const at = (offsetBps: number, up: boolean) => {
        const off = BigInt(Math.round(offsetBps * 100));
        const raw = up ? (m.mark * (1_000_000n + off)) / 1_000_000n : (m.mark * (1_000_000n - off)) / 1_000_000n;
        return up ? ((raw + tickSize - 1n) / tickSize) * tickSize : (raw / tickSize) * tickSize;
      };
      return {
        bids: m.shape.bids.map((l) => ({ price: at(l.offsetBps, false), quantity: l.quantity })),
        asks: m.shape.asks.map((l) => ({ price: at(l.offsetBps, true), quantity: l.quantity })),
      };
    }
    const bids: BookLevel[] = [];
    const asks: BookLevel[] = [];
    for (let i = 0; i < m.levels; i++) {
      const off = BigInt(Math.round((m.halfSpreadBps + i * m.levelStepBps) * 100));
      const tick = m.info.tickSize;
      bids.push({ price: (((m.mark * (1_000_000n - off)) / 1_000_000n) / tick) * tick, quantity: m.levelSize });
      asks.push({ price: (((m.mark * (1_000_000n + off)) / 1_000_000n + tick - 1n) / tick) * tick, quantity: m.levelSize });
    }
    return { bids, asks };
  }

  /** Apply a fill to a position, realising PnL into collateral. */
  private applyFill(a: SimAccount, m: SimMarketState, isBid: boolean, qty: bigint, price: bigint): void {
    const pool = key(m.info.pool);
    const p = a.positions.get(pool) ?? { size: 0n, entry: 0n };
    const delta = isBid ? qty : -qty;
    const one = this.oneBase(m);
    if (p.size === 0n || (p.size > 0n) === (delta > 0n)) {
      const newSize = p.size + delta;
      const absOld = p.size < 0n ? -p.size : p.size;
      const absDelta = delta < 0n ? -delta : delta;
      p.entry = (p.entry * absOld + price * absDelta) / (absOld + absDelta);
      p.size = newSize;
    } else {
      const absOld = p.size < 0n ? -p.size : p.size;
      const absDelta = delta < 0n ? -delta : delta;
      const closing = absDelta < absOld ? absDelta : absOld;
      const dir = p.size > 0n ? 1n : -1n;
      a.collateral += (dir * closing * (price - p.entry)) / one;
      if (absDelta <= absOld) {
        p.size += delta;
        if (p.size === 0n) p.entry = 0n;
      } else {
        p.size += delta; // crosses zero: the remainder opens at the fill price
        p.entry = price;
      }
    }
    a.positions.set(pool, p);
  }

  private fillIoc(a: SimAccount, m: SimMarketState, isBid: boolean, qty: bigint, limit: bigint, feeBps1k: bigint) {
    const { bids, asks } = this.book(m);
    const levels = isBid ? asks : bids;
    const fills: Array<{ quantity: bigint; price: bigint }> = [];
    let remaining = qty;
    for (const l of levels) {
      if (remaining <= 0n) break;
      if (isBid ? l.price > limit : l.price < limit) break;
      const take = l.quantity < remaining ? l.quantity : remaining;
      fills.push({ quantity: take, price: l.price });
      remaining -= take;
    }
    for (const f of fills) {
      this.applyFill(a, m, isBid, f.quantity, f.price);
      const n = (f.quantity * m.mark) / this.oneBase(m);
      a.collateral -= (n * feeBps1k) / 10_000_000n;
    }
    return fills;
  }

  private runLiquidations(): void {
    for (const [owner, a] of this.accounts) {
      let guard = 0;
      while (this.equityOf(a) < this.mmOf(a) && guard++ < 50) {
        // Close the largest position in 10% steps on the book, charging up to
        // the penalty out of the surplus each step creates.
        let target: [string, SimPosition] | null = null;
        for (const entry of a.positions) {
          if (entry[1].size === 0n) continue;
          if (!target || abs(entry[1].size) > abs(target[1].size)) target = entry;
        }
        if (!target) break;
        const m = this.markets.get(target[0])!;
        const size = target[1].size;
        let step = (abs(size) / 10n / m.info.lotSize) * m.info.lotSize;
        if (step < m.info.minQuantity) step = abs(size);
        const isBid = size < 0n;
        const before = this.equityOf(a) - this.mmOf(a);
        const spread = BigInt(this.liquidation.minSpreadBps);
        const price = isBid ? (m.mark * (10_000n + spread)) / 10_000n : (m.mark * (10_000n - spread)) / 10_000n;
        this.applyFill(a, m, isBid, step, price);
        const n = (step * m.mark) / this.oneBase(m);
        const surplus = this.equityOf(a) - this.mmOf(a) - before;
        const cap = (n * BigInt(this.liquidation.penaltyBps)) / 10_000n;
        const flat = a.positions.get(target[0])!.size === 0n;
        const fee = flat ? cap : surplus > 0n ? (surplus < cap ? surplus : cap) : 0n;
        a.collateral -= fee;
        const ev: LiquidationEvent = {
          account: getAddress(owner),
          pool: m.info.pool,
          sizeDelta: isBid ? step : -step,
          markPrice: m.mark,
          blockNumber: this.block,
          txHash: this.nextHash(),
        };
        this.liquidations.push(ev);
        for (const w of this.watchers) if (w.owners.has(owner)) w.handlers.onLiquidation(ev);
      }
    }
  }

  private nextHash(): Hex {
    this.nonce++;
    return keccak256(toHex(`sim-${this.nonce}`));
  }

  // --- Venue --------------------------------------------------------------

  async listMarkets(): Promise<MarketInfo[]> {
    return [...this.markets.values()].map((m) => m.info);
  }

  async liquidationParams(): Promise<LiquidationParams> {
    return this.liquidation;
  }

  async readMargin(_bank: Address, owner: Address): Promise<MarginRead> {
    const a = this.account(owner);
    return {
      blockNumber: this.block,
      equity: this.equityOf(a),
      mmReq: this.mmOf(a),
      cmReq: this.mmOf(a) / 2n,
      status: this.equityOf(a) < this.mmOf(a) ? "PartialLiquidation" : "Healthy",
      activePools: [...a.positions].filter(([, p]) => p.size !== 0n).map(([pool]) => getAddress(pool)),
    };
  }

  async readPosition(market: MarketInfo, owner: Address): Promise<PositionRead> {
    const p = this.account(owner).positions.get(key(market.pool));
    return { size: p?.size ?? 0n, avgEntryPrice: p?.entry ?? 0n };
  }

  async readFeed(market: MarketInfo): Promise<FeedRead> {
    const m = this.market(market.pool);
    return { markPrice: m.mark, markOk: m.markOk };
  }

  async readLiquidationPrice(market: MarketInfo, owner: Address): Promise<bigint | null> {
    const a = this.account(owner);
    const p = a.positions.get(key(market.pool));
    if (!p || p.size === 0n) return null;
    const m = this.market(market.pool);
    // Same single-market solve as the SDK's perpLiquidationPrice.
    const surplus = this.equityOf(a) - this.mmOf(a);
    const mm = BigInt(m.info.maintenanceMarginBps);
    const one = this.oneBase(m);
    const size = abs(p.size);
    const move = (surplus * one * 10_000n) / (size * (p.size > 0n ? 10_000n - mm : 10_000n + mm));
    const liq = p.size > 0n ? m.mark - move : m.mark + move;
    return liq > 0n ? liq : 0n;
  }

  async readBook(market: MarketInfo): Promise<BookRead> {
    return { blockNumber: this.block, ...this.book(this.market(market.pool)) };
  }

  async isLinked(_market: MarketInfo, owner: Address, operator: Address): Promise<boolean> {
    return this.accounts.get(key(owner))?.operators.has(key(operator)) ?? false;
  }

  async builderApproval(_market: MarketInfo, owner: Address, builder: Address): Promise<bigint> {
    return this.approvals.get(`${key(owner)}:${key(builder)}`) ?? 0n;
  }

  async maxBuilderFee(): Promise<bigint> {
    return 10_000n;
  }

  async placeIocFor(
    signer: TradingSigner,
    owner: Address,
    market: MarketInfo,
    order: IocOrder,
    onSent?: (hash: Hex, nonce: number) => Promise<void>,
  ): Promise<PlaceResult> {
    const a = this.account(owner);
    if (!a.operators.has(key(signer.address))) throw new TxRejectedError("OperatorNotAuthorized");
    const fault = this.nextOrderFault;
    this.nextOrderFault = null;
    if (fault === "reject") throw new TxRejectedError("SimulatedRejection");
    const race = this.beforeNextOrder;
    this.beforeNextOrder = null;
    const m = this.market(market.pool);
    // The simulation the real venue runs first: nothing to cross, nothing sent.
    if (fault === null && this.wouldFill(m, order) === 0n) {
      race?.();
      return { hash: null, blockNumber: this.block, fills: [], noFill: true };
    }
    const hash = this.nextHash();
    const nonce = this.takeNonce(signer.address);
    if (onSent) await onSent(hash, nonce);
    const land = (): PlaceResult => {
      this.useNonce(signer.address, nonce);
      this.block++;
      const fee = BigInt(m.info.takerFeeBpsTimes1k) + order.builderFeeBpsTimes1k;
      const fills = this.fillIoc(a, m, order.isBid, order.quantity, order.price, fee);
      this.runLiquidations();
      const result: PlaceResult = { hash, blockNumber: this.block, fills, noFill: fills.length === 0 };
      this.results.set(hash, result);
      for (const w of this.watchers) if (w.owners.has(key(owner))) w.handlers.onPositionChange(getAddress(owner), market.pool);
      return result;
    };
    if (fault === "unknown-dropped") {
      // Waiting in the mempool: it lands if released before its nonce is cancelled.
      this.stuck.set(hash, { nonce, signer: key(signer.address), land: () => void land() });
      throw new TxUnknownError(hash);
    }
    race?.();
    if (fault === "revert") {
      this.useNonce(signer.address, nonce);
      this.block++;
      this.results.set(hash, "reverted");
      throw new TxRevertedError(hash);
    }
    const result = land();
    if (fault === "unknown") throw new TxUnknownError(hash);
    return result;
  }

  private wouldFill(m: SimMarketState, order: IocOrder): bigint {
    const { bids, asks } = this.book(m);
    const levels = order.isBid ? asks : bids;
    let filled = 0n;
    for (const l of levels) {
      if (filled >= order.quantity) break;
      if (order.isBid ? l.price > order.price : l.price < order.price) break;
      filled += l.quantity;
    }
    return filled;
  }

  async orderResult(hash: Hex): Promise<PlaceResult | "reverted" | null> {
    return this.results.get(hash) ?? null;
  }

  async minedNonce(address: Address): Promise<number> {
    const used = this.usedNonces.get(key(address)) ?? new Set<number>();
    let n = 0;
    while (used.has(n)) n++;
    return n;
  }

  async knowsTransaction(hash: Hex): Promise<boolean> {
    return this.results.has(hash) || this.stuck.has(hash);
  }

  async cancelNonce(signer: TradingSigner, nonce: number): Promise<Hex> {
    this.useNonce(signer.address, nonce);
    for (const [h, s] of this.stuck) if (s.signer === key(signer.address) && s.nonce === nonce) this.stuck.delete(h);
    return this.nextHash();
  }

  /** Another actor trades the same account (a second bot), for race tests. */
  externalTrade(owner: Address, pool: Address, isBid: boolean, qty: bigint): void {
    const m = this.market(pool);
    this.applyFill(this.account(owner), m, isBid, qty, m.mark);
  }

  async liquidationsSince(_bank: Address, owner: Address, fromBlock: bigint, maxBlocks = 20_000n): Promise<LiquidationScan> {
    const end = fromBlock + maxBlocks - 1n < this.block ? fromBlock + maxBlocks - 1n : this.block;
    return {
      events: this.liquidations.filter((l) => key(l.account) === key(owner) && l.blockNumber >= fromBlock && l.blockNumber <= end),
      toBlock: end < fromBlock ? fromBlock - 1n : end,
    };
  }

  async nativeBalance(address: Address): Promise<bigint> {
    return this.balances.get(key(address)) ?? 0n;
  }

  async sendNative(from: TradingSigner, to: Address, amount: bigint): Promise<Hex> {
    const have = this.balances.get(key(from.address)) ?? 0n;
    if (have < amount) throw new Error("insufficient funds");
    this.balances.set(key(from.address), have - amount);
    this.balances.set(key(to), (this.balances.get(key(to)) ?? 0n) + amount);
    const hash = this.nextHash();
    if (this.nextSendUnknown) {
      this.nextSendUnknown = false;
      throw new TxUnknownError(hash);
    }
    return hash;
  }

  async blockNumber(): Promise<bigint> {
    return this.block;
  }

  watchAccounts(_bank: Address, owners: Address[], handlers: AccountEventHandlers): () => void {
    const w = { owners: new Set(owners.map(key)), handlers };
    this.watchers.push(w);
    return () => {
      this.watchers = this.watchers.filter((x) => x !== w);
    };
  }

  async close(): Promise<void> {}
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}
