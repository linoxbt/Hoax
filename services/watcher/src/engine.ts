// The health loop, executor and reconciler for one account at a time.
//
// Every tick: confirm any order whose result is not known yet; read health,
// positions and marks; record them; then for the largest protected position,
// decide. Only the executor sends transactions, only to the pool through
// placeOrderFor, and only as IOC. Anything uncertain fails closed: no order is
// sent on a read that errored, on a mark the pool calls stale, or on a market
// with an order still unconfirmed.
//
// An order is recorded the moment it has a transaction hash, as "unconfirmed".
// From then on, whatever fails (the receipt wait, the reads after the fill,
// the process itself), the next tick finds that row, asks the chain what
// happened, and reconciles before it will act on that market again.

import { randomUUID } from "node:crypto";
import {
  clampClose,
  decide,
  validatePolicyForMarket,
  limitPrice,
  notional,
  reconcile,
  sign,
  type ActDecision,
  type LiquidationParams,
  type Outcome,
  type PositionState,
  type Receipt,
} from "@hoax/core";
import {
  TxRejectedError,
  TxRevertedError,
  TxUnknownError,
  revertName,
  signReceipt,
  type FeedRead,
  type Fill,
  type IocOrder,
  type LiquidationEvent,
  type MarketInfo,
  type PlaceResult,
  type TradingSigner,
  type Venue,
} from "@hoax/chain";
import type { AccountRow, ActionRow, NewAction, PolicyRow, Store } from "@hoax/db";
import { getAddress, type Address, type Hex } from "viem";
import type { KeyProvider } from "./keystore.ts";
import type { Logger } from "./log.ts";

export interface EngineConfig {
  /** Builder address Hoax attaches fees to, or null for none. */
  builder: Address | null;
  /** Fee Hoax charges when the trader's approval covers it, bps x 1000 (the pool caps at 10 bps = 10000). */
  builderFeeBpsTimes1k: bigint;
  dryRun: boolean;
  bookDepth: number;
  /** A stale mark older than this raises an alert. */
  staleAlertMs: number;
  /** The same skip reason is written as a receipt at most this often per position. */
  skipReceiptEveryMs: number;
  /** Read errors in a row before the trader is alerted. */
  readErrorAlertAfter: number;
  /** How often each account's liquidation log is scanned. */
  liqScanEveryMs: number;
  /** Blocks one liquidation scan covers at most (3 log reads); the cursor pages forward across ticks. */
  liqScanMaxBlocks: bigint;
  /** A health tick is stored at least this often per position, and whenever health moves or nears the trigger. */
  tickWriteEveryMs: number;
  /** A sent order with no receipt after this long is taken as dropped. */
  confirmTimeoutMs: number;
  /** Mark reads are shared across accounts for this long (0 = every read goes to the chain). */
  feedCacheMs: number;
}

/** Liquidation steps within this window after a miss belong to the same episode. */
const MISS_EPISODE_MS = 10 * 60_000;
/** Without a cursor, the first liquidation scan looks this far back (20 minutes of 100 ms blocks). */
const FIRST_SCAN_LOOKBACK = 12_000n;
/** Backoff after a rejected or reverted order: 5 s, doubling, at most 10 minutes. */
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 10 * 60_000;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  builder: null,
  builderFeeBpsTimes1k: 0n,
  dryRun: false,
  bookDepth: 20,
  staleAlertMs: 60_000,
  skipReceiptEveryMs: 5 * 60_000,
  readErrorAlertAfter: 5,
  liqScanEveryMs: 5_000,
  liqScanMaxBlocks: 3_000n,
  tickWriteEveryMs: 10_000,
  confirmTimeoutMs: 2 * 60_000,
  feedCacheMs: 0,
};

export interface EngineDeps {
  venue: Venue;
  store: Store;
  keys: KeyProvider;
  log: Logger;
  config: EngineConfig;
  now?: () => number;
}

interface PositionView {
  market: MarketInfo;
  size: bigint;
  mark: bigint;
  markOk: boolean;
  liqPrice: bigint | null;
}

export type TickOutcome =
  | { kind: "idle"; reason: string }
  | { kind: "skip"; reason: string }
  | { kind: "acted"; actionId: string; outcome: Outcome }
  | { kind: "error"; message: string };

interface AccountMemory {
  /** When Hoax last sent an order per market; null once the store has been asked and had none. */
  lastActionAt: Map<string, number | null>;
  retryNoFill: Set<string>;
  staleSince: Map<string, number>;
  staleAlerted: Set<string>;
  lastSkipReceipt: Map<string, number>;
  readErrors: number;
  /** When a missed receipt was last written, per pool (the store answers after a restart). */
  lastMissAt: Map<string, number>;
  lastHealth: number | null;
  lastLiqScanAt: number | null;
  /** Rejected or reverted orders in a row per market, and when the next try is allowed. */
  backoff: Map<string, { failures: number; until: number }>;
  lastTickWrite: Map<string, { at: number; health: number | null }>;
  /** Sent orders the store refused to record yet, retried every tick until it takes them. */
  unsaved: Map<string, NewAction>;
  /** Stuck orders already replaced at their nonce, by action id, with when. */
  cancelled: Map<string, number>;
}

/** What the executor knows about an order it is about to send, kept for the final receipt. */
interface Pending {
  draft: NewAction;
  market: MarketInfo;
  isBid: boolean;
  fee: bigint;
  penaltyBps: number;
  /** The policy's slippage bound, for a flatten. */
  slippageBps: number;
}

/** Reasons on a flatten's own record start with this. */
const FLATTEN = "flatten:";

export class Engine {
  private readonly memory = new Map<string, AccountMemory>();
  private readonly approvals = new Map<string, { at: number; fee: bigint }>();
  private readonly feeds = new Map<string, { at: number; read: FeedRead }>();
  private readonly now: () => number;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
  }

  private mem(accountId: string): AccountMemory {
    let m = this.memory.get(accountId);
    if (!m) {
      m = {
        lastActionAt: new Map(),
        retryNoFill: new Set(),
        staleSince: new Map(),
        staleAlerted: new Set(),
        lastSkipReceipt: new Map(),
        readErrors: 0,
        lastMissAt: new Map(),
        lastHealth: null,
        lastLiqScanAt: null,
        backoff: new Map(),
        lastTickWrite: new Map(),
        unsaved: new Map(),
        cancelled: new Map(),
      };
      this.memory.set(accountId, m);
    }
    return m;
  }

  /** One full pass for one active account. Never throws. */
  async tick(account: AccountRow): Promise<TickOutcome> {
    const mem = this.mem(account.id);
    try {
      const result = await this.tickInner(account, mem);
      mem.readErrors = 0;
      return result;
    } catch (err) {
      mem.readErrors++;
      const message = err instanceof Error ? err.message : String(err);
      this.deps.log.warn("tick failed, no orders sent", { account: account.owner, error: message.slice(0, 200) });
      if (mem.readErrors === this.deps.config.readErrorAlertAfter) {
        await this.alert(account, "rpc", `Hoax could not read your account ${mem.readErrors} times in a row and is sending no orders until reads recover.`).catch(
          () => {},
        );
      }
      return { kind: "error", message };
    }
  }

  private async tickInner(account: AccountRow, mem: AccountMemory): Promise<TickOutcome> {
    const { venue, store } = this.deps;
    const owner = getAddress(account.owner);
    const markets = await venue.listMarkets();
    if (markets.length === 0) return { kind: "idle", reason: "no markets" };
    const marginBank = markets[0].marginBank;
    const byPool = new Map(markets.map((m) => [m.pool.toLowerCase(), m]));
    const bySymbol = new Map(markets.map((m) => [m.symbol, m]));

    // A sent order the store did not take yet goes on record before anything else.
    await this.saveUnsaved(mem);
    // Orders whose result is not known come first: nothing else is sent on
    // their market until the chain says what they did.
    const blocked = await this.confirmOutstanding(account, byPool);

    const [margin, policies] = await Promise.all([venue.readMargin(marginBank, owner), store.listPolicies(account.id)]);
    const H = margin.mmReq > 0n ? Number(margin.equity) / Number(margin.mmReq) : Number.POSITIVE_INFINITY;
    const policyBy = new Map<string, PolicyRow>(policies.map((p) => [p.market, p]));

    // Positions the account holds, plus any market it has a policy on (to see a
    // protected position vanish).
    const pools = new Set(margin.activePools.map((p) => p.toLowerCase()));
    for (const p of policies) {
      const m = bySymbol.get(p.market);
      if (m) pools.add(m.pool.toLowerCase());
    }
    const views: PositionView[] = await Promise.all(
      [...pools]
        .map((p) => byPool.get(p))
        .filter((m): m is MarketInfo => Boolean(m))
        .map(async (market) => {
          const [pos, feed, liq] = await Promise.all([
            venue.readPosition(market, owner),
            this.readFeed(market),
            venue.readLiquidationPrice(market, owner),
          ]);
          return { market, size: pos.size, mark: feed.markPrice, markOk: feed.markOk, liqPrice: liq };
        }),
    );

    // The decision comes first; health ticks and the liquidation scan are
    // bookkeeping, done after it and never allowed to stop it.
    let outcome: TickOutcome;
    try {
      outcome = await this.decideAndAct(account, mem, views, policyBy, blocked, margin, H, marginBank, owner);
    } finally {
      await this.recordTicks(account, mem, views, margin.blockNumber, H, margin.equity, margin.mmReq, policyBy).catch((err) =>
        this.deps.log.warn("could not store health ticks", { account: account.owner, error: String(err).slice(0, 160) }),
      );
      await this.scanLiquidations(account, mem, marginBank, byPool, views, policyBy, margin.equity, margin.mmReq).catch((err) =>
        this.deps.log.warn("liquidation scan failed; it resumes from the same block", { account: account.owner, error: String(err).slice(0, 160) }),
      );
      mem.lastHealth = Number.isFinite(H) ? H : null;
    }
    return outcome;
  }

  /** Confirm this account's unconfirmed orders; the markets still waiting on one. Also used for accounts no longer active. */
  async confirmOutstanding(account: AccountRow, byPool?: Map<string, MarketInfo>): Promise<Set<string>> {
    const mem = this.mem(account.id);
    const pools = byPool ?? new Map((await this.deps.venue.listMarkets()).map((m) => [m.pool.toLowerCase(), m]));
    const blocked = new Set<string>();
    for (const action of await this.deps.store.listUnconfirmedActions(account.id)) {
      const market = pools.get(action.pool.toLowerCase());
      if (!market) continue;
      const settled = await this.confirm(account, mem, action, market);
      if (!settled) blocked.add(market.symbol);
    }
    return blocked;
  }

  private async saveUnsaved(mem: AccountMemory): Promise<void> {
    for (const [id, draft] of mem.unsaved) {
      await this.deps.store.insertAction(draft);
      mem.unsaved.delete(id);
    }
  }

  private async decideAndAct(
    account: AccountRow,
    mem: AccountMemory,
    views: PositionView[],
    policyBy: Map<string, PolicyRow>,
    blocked: Set<string>,
    margin: { equity: bigint; mmReq: bigint },
    H: number,
    marginBank: Address,
    owner: Address,
  ): Promise<TickOutcome> {
    const { venue } = this.deps;
    if (account.paused) return { kind: "idle", reason: "paused" };

    const candidates = views
      .filter((v) => v.size !== 0n && policyBy.get(v.market.symbol)?.enabled)
      .sort((a, b) => (notional(b.size, b.mark, b.market.baseDecimals) > notional(a.size, a.mark, a.market.baseDecimals) ? 1 : -1));
    if (candidates.length === 0) return { kind: "idle", reason: "no protected position" };

    const liquidation = await venue.liquidationParams(marginBank);
    let lastSkip: TickOutcome = { kind: "idle", reason: "health above trigger" };

    for (const view of candidates) {
      const policy = policyBy.get(view.market.symbol)!;
      const key = view.market.symbol;
      this.trackStale(account, mem, view);
      // The web app validates policies, but the engine trusts nothing it did not check itself.
      const problems = validatePolicyForMarket(policy, view.market);
      if (problems.length > 0) {
        await this.skipReceipt(account, mem, view, margin.equity, margin.mmReq, H, `the saved policy is invalid (${problems[0]}); save it again`, true);
        lastSkip = { kind: "skip", reason: "invalid policy" };
        continue;
      }
      // Most ticks end here: health is above this policy's trigger, so the book
      // and the fee approval are not worth a read.
      if (view.markOk && H > policy.triggerHealth - policy.triggerMargin) continue;
      if (blocked.has(key)) {
        lastSkip = { kind: "skip", reason: "an earlier order is not confirmed yet" };
        continue;
      }
      const backoff = mem.backoff.get(key);
      if (backoff && this.now() < backoff.until) {
        lastSkip = { kind: "skip", reason: "backing off after a failed order" };
        continue;
      }

      const book = await venue.readBook(view.market, this.deps.config.bookDepth);
      const fee = await this.builderFee(account, view.market, owner);
      const state: PositionState = {
        equity: margin.equity,
        mmReq: margin.mmReq,
        positionSize: view.size,
        mark: view.mark,
        markOk: view.markOk,
        liquidationPrice: view.liqPrice,
        bids: book.bids,
        asks: book.asks,
      };
      const retrying = mem.retryNoFill.has(key);
      const lastAt = retrying ? null : await this.lastActionAt(account, key, mem);
      const decision = decide({
        nowMs: this.now(),
        policy,
        market: view.market,
        state,
        liquidation,
        lastActionAtMs: lastAt,
        paused: account.paused,
        builderFeeBpsTimes1k: Number(fee),
      });

      if (decision.type === "idle") continue;
      if (decision.type === "skip") {
        if (decision.reason !== "cooldown" && decision.reason !== "mark feed stale") {
          await this.skipReceipt(account, mem, view, margin.equity, margin.mmReq, decision.healthBefore, decision.reason, decision.alert);
        }
        lastSkip = { kind: "skip", reason: decision.reason };
        continue;
      }
      return this.execute(account, mem, view, decision, margin.equity, margin.mmReq, liquidation, fee, policy.maxSlippageBps);
    }
    return lastSkip;
  }

  private async readFeed(market: MarketInfo): Promise<FeedRead> {
    const ttl = this.deps.config.feedCacheMs;
    if (ttl <= 0) return this.deps.venue.readFeed(market);
    const hit = this.feeds.get(market.pool);
    const now = Date.now(); // real time: the cache is about RPC load, not the engine's clock
    if (hit && now - hit.at < ttl) return hit.read;
    const read = await this.deps.venue.readFeed(market);
    this.feeds.set(market.pool, { at: now, read });
    return read;
  }

  /** Health ticks are kept for charts and the dashboard: one per position every few seconds, more when it matters. */
  private async recordTicks(
    account: AccountRow,
    mem: AccountMemory,
    views: PositionView[],
    block: bigint,
    H: number,
    equity: bigint,
    mmReq: bigint,
    policyBy: Map<string, PolicyRow>,
  ): Promise<void> {
    const health = Number.isFinite(H) ? H : null;
    const now = this.now();
    const rows = views.filter((v) => {
      if (v.size === 0n) return false;
      const last = mem.lastTickWrite.get(v.market.symbol);
      const policy = policyBy.get(v.market.symbol);
      const near = policy !== undefined && health !== null && health <= policy.triggerHealth + 0.1;
      const moved = last === undefined || last.health === null || health === null || Math.abs(health - last.health) >= 0.01;
      return last === undefined || near || moved || now - last.at >= this.deps.config.tickWriteEveryMs;
    });
    if (rows.length === 0) return;
    await this.deps.store.insertHealthTicks(
      rows.map((v) => ({
        accountId: account.id,
        market: v.market.symbol,
        block,
        health,
        equity,
        mmReq,
        mark: v.mark,
        markOk: v.markOk,
        size: v.size,
        liqPrice: v.liqPrice,
      })),
    );
    for (const v of rows) mem.lastTickWrite.set(v.market.symbol, { at: now, health });
  }

  private async lastActionAt(account: AccountRow, market: string, mem: AccountMemory): Promise<number | null> {
    // One engine per network holds the lease, so after the first look the
    // memory is authoritative; the store answers once, after a restart, for
    // the owner on this network (a re-registration does not reset it).
    if (mem.lastActionAt.has(market)) return mem.lastActionAt.get(market) ?? null;
    const at = await this.deps.store.lastActionAt(account.owner, this.deps.venue.chainId ?? account.chainId, market);
    mem.lastActionAt.set(market, at ? at.getTime() : null);
    return at ? at.getTime() : null;
  }

  private trackStale(account: AccountRow, mem: AccountMemory, view: PositionView): void {
    const key = view.market.symbol;
    if (view.markOk) {
      mem.staleSince.delete(key);
      mem.staleAlerted.delete(key);
      return;
    }
    const since = mem.staleSince.get(key) ?? this.now();
    mem.staleSince.set(key, since);
    if (this.now() - since >= this.deps.config.staleAlertMs && !mem.staleAlerted.has(key)) {
      mem.staleAlerted.add(key);
      this.alert(
        account,
        "stale",
        `The ${key} mark price has been stale for over ${Math.round(this.deps.config.staleAlertMs / 1000)} s. Hoax does not act on a stale mark.`,
      ).catch((err) => this.deps.log.warn("could not store an alert", { error: String(err).slice(0, 160) }));
    }
  }

  /** The builder fee Hoax may attach: only when the trader's on-chain approval and the pool cap both cover it. */
  private async builderFee(account: AccountRow, market: MarketInfo, owner: Address): Promise<bigint> {
    const { builder, builderFeeBpsTimes1k: wanted } = this.deps.config;
    if (!builder || wanted <= 0n) return 0n;
    const cacheKey = `${account.id}:${market.pool}`;
    const hit = this.approvals.get(cacheKey);
    if (hit && this.now() - hit.at < 60_000) return hit.fee;
    let fee = 0n;
    try {
      const [approval, cap] = await Promise.all([
        this.deps.venue.builderApproval(market, owner, builder),
        this.deps.venue.maxBuilderFee(market),
      ]);
      fee = approval >= wanted && cap >= wanted ? wanted : 0n;
      if (approval !== account.builderApproval1k) await this.deps.store.setBuilderApproval(account.id, approval);
    } catch {
      fee = 0n; // never let a fee read cause a missed save or a revert
    }
    this.approvals.set(cacheKey, { at: this.now(), fee });
    return fee;
  }

  private backOff(mem: AccountMemory, key: string): void {
    const failures = (mem.backoff.get(key)?.failures ?? 0) + 1;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
    mem.backoff.set(key, { failures, until: this.now() + delay });
  }

  private async execute(
    account: AccountRow,
    mem: AccountMemory,
    view: PositionView,
    decision: ActDecision,
    equityBefore: bigint,
    mmReqBefore: bigint,
    liquidation: LiquidationParams,
    fee: bigint,
    slippageBps: number,
  ): Promise<TickOutcome> {
    const { venue, log, config } = this.deps;
    const owner = getAddress(account.owner);
    const market = view.market;
    const key = market.symbol;

    const signer = account.hoaxKey ? await this.deps.keys.get(account.hoaxKey) : null;
    if (!signer) {
      await this.alert(account, "key", "Hoax's key for this account is missing from the keystore, so it cannot act.");
      return { kind: "skip", reason: "key missing" };
    }

    // Size from a fresh read, immediately before sending.
    const fresh = await venue.readPosition(market, owner);
    if (fresh.size === 0n) {
      return { kind: "idle", reason: "position closed before send" };
    }
    if (sign(fresh.size) !== sign(view.size)) {
      if (config.dryRun) {
        log.info("dry run: the position changed side before send; a live engine would pause", { account: owner, market: key });
        return { kind: "skip", reason: "position changed side before send" };
      }
      await this.pause(account, `Your ${key} position changed side before Hoax could act. Hoax paused this account until you confirm.`);
      return { kind: "skip", reason: "position changed side before send" };
    }
    const qty = clampClose(decision.quantity, fresh.size);

    if (config.dryRun) {
      log.info("dry run: would close", { account: owner, market: key, qty, limit: decision.limitPrice, health: decision.healthBefore });
      mem.lastActionAt.set(key, this.now());
      return { kind: "skip", reason: "dry run" };
    }

    const forcedSlippage =
      decision.estLiquidationCost - (notional(fresh.size, view.liqPrice ?? view.mark, market.baseDecimals) * BigInt(liquidation.penaltyBps)) / 10_000n;
    const draft = this.draftAction(account, signer, market, decision.side, fresh.size, qty, view.mark, {
      estCloseCost: decision.estCloseCost,
      estLiqCost: decision.estLiquidationCost,
      forcedSlippage: forcedSlippage > 0n ? forcedSlippage : 0n,
      equityBefore,
      mmReqBefore,
      healthBefore: decision.healthBefore,
      liqPriceBefore: view.liqPrice,
      builderFee1k: fee,
      reason: "order sent, waiting for its receipt",
    });
    const pending: Pending = { draft, market, isBid: decision.isBid, fee, penaltyBps: liquidation.penaltyBps, slippageBps };

    const sent = await this.send(account, mem, signer, market, draft, {
      isBid: decision.isBid,
      price: decision.limitPrice,
      quantity: qty,
      builder: fee > 0n ? config.builder : null,
      builderFeeBpsTimes1k: fee,
    });
    if (sent.kind === "rejected") {
      this.backOff(mem, key);
      await this.skipReceipt(account, mem, view, equityBefore, mmReqBefore, decision.healthBefore, `order rejected: ${sent.reason.slice(0, 120)}`, true);
      return { kind: "skip", reason: "order rejected" };
    }
    if (sent.kind === "reverted") {
      this.backOff(mem, key);
      return { kind: "skip", reason: "order reverted" };
    }
    if (sent.kind === "unknown") return { kind: "skip", reason: "order sent, result unknown" };

    const result = sent.result;
    if (result.hash === null) {
      // The IOC simulated to no fill: nothing was sent.
      if (!mem.retryNoFill.has(key)) {
        mem.retryNoFill.add(key);
        log.info("IOC found no liquidity, retrying next tick", { account: owner, market: key });
        return { kind: "skip", reason: "no fill, retrying" };
      }
      mem.retryNoFill.delete(key);
      mem.lastActionAt.set(key, this.now());
      await this.skipReceipt(account, mem, view, equityBefore, mmReqBefore, decision.healthBefore, "no liquidity within max slippage", true, true);
      return { kind: "skip", reason: "no liquidity" };
    }
    mem.retryNoFill.delete(key);
    mem.backoff.delete(key);
    return this.finalize(account, mem, pending, result, signer, false);
  }

  /** The record of an order about to be sent, before it has a hash. */
  private draftAction(
    account: AccountRow,
    signer: TradingSigner,
    market: MarketInfo,
    side: "long" | "short",
    sizeBefore: bigint,
    qty: bigint,
    mark: bigint,
    extra: Pick<NewAction, "estCloseCost" | "estLiqCost" | "forcedSlippage" | "equityBefore" | "mmReqBefore" | "healthBefore" | "liqPriceBefore" | "builderFee1k" | "reason">,
  ): NewAction {
    const base = this.receiptBase(account, signer, market, side, "unconfirmed", extra.reason);
    return {
      id: randomUUID(),
      accountId: account.id,
      owner: account.owner,
      market: market.symbol,
      pool: market.pool,
      side,
      block: null,
      txHash: null,
      txNonce: null,
      sizeBefore,
      sizeRequested: qty,
      sizeFilled: 0n,
      sizeAfter: null,
      avgPrice: null,
      mark,
      cost: null,
      healthAfter: null,
      liqPriceAfter: null,
      outcome: "unconfirmed",
      receipt: {
        ...base,
        sizeBefore: sizeBefore.toString(),
        sizeRequested: qty.toString(),
        markAtClose: mark.toString(),
        healthBefore: receiptHealth(extra.healthBefore) ?? 0,
      },
      receiptHash: "",
      signature: null,
      ...extra,
    };
  }

  /**
   * Send one order and put it on record the moment it has a hash. Whatever
   * fails after that, the order is "unknown" and the next tick confirms it.
   */
  private async send(
    account: AccountRow,
    mem: AccountMemory,
    signer: TradingSigner,
    market: MarketInfo,
    draft: NewAction,
    order: IocOrder,
  ): Promise<{ kind: "sent"; result: PlaceResult } | { kind: "rejected"; reason: string } | { kind: "reverted" } | { kind: "unknown" }> {
    const { venue, log, store } = this.deps;
    const key = market.symbol;
    let recorded = false;
    try {
      const result = await venue.placeIocFor(signer, getAddress(account.owner), market, order, async (hash, nonce) => {
        // From here the order may land whatever happens next: count it for
        // the cooldown and put it on record before it is broadcast.
        recorded = true;
        mem.lastActionAt.set(key, this.now());
        draft.txHash = hash;
        draft.txNonce = nonce;
        draft.receipt = { ...draft.receipt, txHash: hash };
        try {
          await store.insertAction(draft);
        } catch (err) {
          mem.unsaved.set(draft.id, draft); // retried every tick until the store takes it
          log.error("could not record a sent order yet; retrying", { tx: hash, error: String(err).slice(0, 200) });
        }
      });
      return { kind: "sent", result };
    } catch (err) {
      if (err instanceof TxRejectedError) {
        // The node refused it: nothing is out. A record already written is settled as such.
        if (recorded) await this.settleWithoutFill(account, mem, draft, null, `the order was refused: ${err.reason.slice(0, 120)}`, false);
        log.warn("order rejected", { account: account.owner, market: key, reason: err.reason });
        return { kind: "rejected", reason: err.reason };
      }
      if (err instanceof TxRevertedError) {
        log.warn("order reverted on chain", { account: account.owner, market: key, tx: err.hash });
        await this.settleWithoutFill(account, mem, draft, err.hash, "the order reverted on chain", true);
        return { kind: "reverted" };
      }
      if (recorded || err instanceof TxUnknownError) {
        log.warn("order sent, result unknown; confirming on the next tick", { account: account.owner, market: key, tx: draft.txHash, error: revertName(err).slice(0, 160) });
        if (err instanceof TxUnknownError) draft.txHash = err.hash;
        await store.insertAction(draft).catch(() => mem.unsaved.set(draft.id, draft));
        return { kind: "unknown" };
      }
      return { kind: "rejected", reason: revertName(err) };
    }
  }

  /**
   * Ask the chain what an unconfirmed order did, and settle its record.
   * True when settled; false while it can still land. An order with no
   * receipt is never written off while it might land: past the timeout its
   * nonce is taken by an empty transaction first, so it cannot.
   */
  private async confirm(account: AccountRow, mem: AccountMemory, action: ActionRow, market: MarketInfo): Promise<boolean> {
    const { venue, log } = this.deps;
    if (!action.txHash) {
      await this.settleWithoutFill(account, mem, action, null, "the order was never sent", false);
      return true;
    }
    const hash = action.txHash as Hex;
    const result = await venue.orderResult(hash, market);
    const signer = account.hoaxKey ? await this.deps.keys.get(account.hoaxKey) : null;
    if (result === null) {
      // The draft receipt is stamped on the engine's clock when the order went out.
      const sentAt = Date.parse(action.receipt.createdAt) || action.createdAt.getTime();
      const age = this.now() - sentAt;
      const timeout = this.deps.config.confirmTimeoutMs;
      if (age < timeout) return false;
      if (action.txNonce === null || !signer) {
        // An older record without a nonce: nothing to replace. Written off after a long wait, and said so.
        if (age < timeout * 5) return false;
        await this.settleWithoutFill(account, mem, action, hash, "the order was sent but never confirmed on chain; check the transaction", true);
        return true;
      }
      if ((await venue.minedNonce(signer.address)) > action.txNonce) {
        // The nonce is used and this hash has no receipt: something else took
        // the slot (the cancel below), so this order can never land.
        await this.settleWithoutFill(account, mem, action, hash, "the order was sent but never landed; its slot was cancelled", true);
        return true;
      }
      const cancelledAt = mem.cancelled.get(action.id);
      if (cancelledAt === undefined || this.now() - cancelledAt > timeout) {
        try {
          const cancel = await venue.cancelNonce(signer, action.txNonce);
          mem.cancelled.set(action.id, this.now());
          log.warn("order stuck; replaced at its nonce so it cannot land later", { account: account.owner, tx: hash, cancel });
        } catch (err) {
          log.error("could not replace a stuck order", { account: account.owner, tx: hash, error: revertName(err).slice(0, 160) });
          if (age >= timeout * 5) {
            await this.settleWithoutFill(account, mem, action, hash, "the order never confirmed and could not be cancelled; check the transaction", true);
            await this.pause(account, `An order Hoax sent on ${action.market} (tx ${hash}) never confirmed and could not be cancelled. Hoax paused this account; check the transaction.`);
            return true;
          }
        }
      }
      return false;
    }
    mem.cancelled.delete(action.id);
    if (result === "reverted") {
      this.backOff(mem, market.symbol);
      await this.settleWithoutFill(account, mem, action, hash, "the order reverted on chain", true);
      return true;
    }
    if (!signer) return false;
    mem.lastActionAt.set(market.symbol, Math.max(mem.lastActionAt.get(market.symbol) ?? 0, Date.parse(action.receipt.createdAt) || 0));
    const liquidation = await venue.liquidationParams(market.marginBank);
    const { createdAt: _created, ...draft } = action;
    const pending: Pending = { draft, market, isBid: action.side === "short", fee: action.builderFee1k, penaltyBps: liquidation.penaltyBps, slippageBps: 0 };
    await this.finalize(account, mem, pending, result, signer, true);
    return true;
  }

  /** An order that filled nothing: a skipped receipt, keeping its tx hash. */
  private async settleWithoutFill(
    account: AccountRow,
    mem: AccountMemory,
    draft: NewAction | ActionRow,
    hash: Hex | null,
    reason: string,
    alert: boolean,
  ): Promise<void> {
    const signer = account.hoaxKey ? await this.deps.keys.get(account.hoaxKey) : null;
    const receipt: Receipt = { ...draft.receipt, outcome: "skipped", reason, txHash: hash, sizeFilled: "0", sizeAfter: draft.sizeBefore.toString() };
    const signed = signer ? await signReceipt(signer, receipt) : null;
    const { createdAt: _c, ...row } = draft as ActionRow;
    await this.deps.store.insertAction({
      ...row,
      txHash: hash,
      sizeFilled: 0n,
      sizeAfter: draft.sizeBefore,
      outcome: "skipped",
      reason,
      receipt,
      receiptHash: signed?.hash ?? "",
      signature: signed?.signature ?? null,
    });
    mem.unsaved.delete(draft.id);
    if (alert) {
      // One alert per reason per market per skip-receipt period, so a repeating failure cannot flood the trader.
      const k = `${draft.market}:${reason}`;
      const last = mem.lastSkipReceipt.get(k);
      if (last === undefined || this.now() - last >= this.deps.config.skipReceiptEveryMs) {
        mem.lastSkipReceipt.set(k, this.now());
        await this.alert(account, "skipped", `Hoax's order on ${draft.market} did not fill: ${reason}.`);
      }
    }
  }

  /**
   * Reconcile a filled order and write its signed receipt.
   *
   * Right after the fill (`late` false), the position is read now and a flip
   * Hoax caused is flattened at once. When the result is only learned later
   * (`late`: a lost receipt, a restart), the position may have changed by the
   * trader's own hand since, so nothing is traded: the fill is recorded as
   * the chain reports it, and a position on the other side only pauses the
   * account and tells the trader.
   */
  private async finalize(account: AccountRow, mem: AccountMemory, p: Pending, result: PlaceResult, signer: TradingSigner, late: boolean): Promise<TickOutcome> {
    const { venue, log, store } = this.deps;
    const owner = getAddress(account.owner);
    const { market, draft } = p;
    const key = market.symbol;
    const hash = result.hash as Hex;
    const isFlatten = draft.reason?.startsWith(FLATTEN) ?? false;

    if (result.fills.length === 0) {
      await this.settleWithoutFill(account, mem, draft, hash, "no liquidity within max slippage", true);
      return { kind: "skip", reason: "no liquidity" };
    }

    const filled = result.fills.reduce((s, f) => s + f.quantity, 0n);
    const avgPrice = filled > 0n ? result.fills.reduce((s, f) => s + f.quantity * f.price, 0n) / filled : null;
    const cost = closeCost(result.fills, draft.mark, p.isBid, market, p.fee);
    const expectedAfter = draft.sizeBefore - BigInt(sign(draft.sizeBefore)) * filled;

    // If these reads fail the row stays unconfirmed and the next tick settles it.
    const [after, marginAfter, liqAfter] = await Promise.all([
      venue.readPosition(market, owner),
      venue.readMargin(market.marginBank, owner),
      venue.readLiquidationPrice(market, owner),
    ]);
    let sizeAfter = late ? expectedAfter : after.size;
    let healthAfter = marginAfter.mmReq > 0n ? Number(marginAfter.equity) / Number(marginAfter.mmReq) : Number.POSITIVE_INFINITY;

    let outcome: Outcome = isFlatten ? "conflict" : "pending";
    let reason: string | null = isFlatten ? draft.reason : filled < draft.sizeRequested ? "partial fill" : null;

    if (late) {
      const flippedNow = after.size !== 0n && sign(after.size) !== sign(draft.sizeBefore);
      if (!isFlatten && after.size !== expectedAfter) {
        reason = `${reason ? `${reason}; ` : ""}confirmed late: the position is ${after.size} base units now, after other trades`;
      }
      if (flippedNow && !isFlatten) {
        outcome = "conflict";
        await this.pause(
          account,
          `Hoax's ${key} close (tx ${hash}) was confirmed late and your position is now on the other side. Hoax did not trade on it and paused this account; check the position.`,
        );
      }
    } else if (!isFlatten) {
      const rec = reconcile({ sizeBefore: draft.sizeBefore, requested: draft.sizeRequested, filled, sizeAfter: after.size });
      if (rec.status === "flipped") {
        outcome = "conflict";
        const flat = await this.flatten(account, mem, signer, market, draft, after.size, rec.flipAmount, p.slippageBps);
        sizeAfter = flat.sizeAfter ?? after.size;
        reason = flat.reason;
        await this.pause(account, flat.message);
        const m = await venue.readMargin(market.marginBank, owner).catch(() => null);
        if (m) healthAfter = m.mmReq > 0n ? Number(m.equity) / Number(m.mmReq) : Number.POSITIVE_INFINITY;
      } else if (rec.status === "conflict") {
        outcome = "conflict";
        reason = `another trade moved the position by ${rec.externalChange} base units during the close`;
        await this.pause(account, `Another trade changed your ${key} position while Hoax was closing. Hoax paused this account until you confirm.`);
      }
    }

    const receipt: Receipt = {
      ...draft.receipt,
      outcome,
      reason,
      blockNumber: result.blockNumber.toString(),
      txHash: hash,
      sizeBefore: draft.sizeBefore.toString(),
      sizeRequested: draft.sizeRequested.toString(),
      sizeFilled: filled.toString(),
      sizeAfter: sizeAfter.toString(),
      avgFillPrice: avgPrice?.toString() ?? null,
      markAtClose: draft.mark.toString(),
      closeCost: cost.toString(),
      estCloseCost: draft.estCloseCost?.toString() ?? null,
      estLiquidationCost: draft.estLiqCost?.toString() ?? null,
      healthBefore: receiptHealth(draft.healthBefore) ?? 0,
      healthAfter: receiptHealth(healthAfter),
      liqPriceBefore: draft.liqPriceBefore?.toString() ?? null,
      liqPriceAfter: liqAfter?.toString() ?? null,
      builderFeeBpsTimes1k: Number(p.fee),
    };
    const { hash: receiptHash, signature } = await signReceipt(signer, receipt);
    await store.insertAction({
      ...draft,
      block: result.blockNumber,
      txHash: hash,
      sizeFilled: filled,
      sizeAfter,
      avgPrice,
      cost,
      healthAfter,
      liqPriceAfter: liqAfter,
      outcome,
      reason,
      receipt,
      receiptHash,
      signature,
    });
    mem.unsaved.delete(draft.id);
    if (outcome === "pending") {
      await store.upsertCounterfactual({
        actionId: draft.id,
        originalLiqPrice: draft.liqPriceBefore,
        reachedAtBlock: null,
        equityAtReach: null,
        equityIfLiquidated: null,
        preserved: null,
        finalOutcome: "pending",
        resolvedAt: null,
        resolution: null,
        resolutionHash: null,
        resolutionSignature: null,
      });
    }
    log.info(isFlatten ? "flatten settled" : "closed", {
      account: owner,
      market: key,
      filled,
      tx: hash,
      late,
      healthBefore: Number.isFinite(draft.healthBefore) ? draft.healthBefore.toFixed(3) : "flat",
      healthAfter: Number.isFinite(healthAfter) ? healthAfter.toFixed(3) : "flat",
      outcome,
    });
    return { kind: "acted", actionId: draft.id, outcome };
  }

  /**
   * Undo Hoax's own overshoot after a flip: an order on its own record, sent
   * like any other, within the policy's slippage. Says what the chain shows
   * afterwards, not what the order hoped for.
   */
  private async flatten(
    account: AccountRow,
    mem: AccountMemory,
    signer: TradingSigner,
    market: MarketInfo,
    close: NewAction,
    flippedSize: bigint,
    amount: bigint,
    slippageBps: number,
  ): Promise<{ reason: string; message: string; sizeAfter: bigint | null }> {
    const { venue } = this.deps;
    const owner = getAddress(account.owner);
    const key = market.symbol;
    const isBid = flippedSize < 0n;
    const feed = await venue.readFeed(market).catch(() => null);
    const mark = feed?.markOk ? feed.markPrice : close.mark;
    const draft = this.draftAction(account, signer, market, isBid ? "short" : "long", flippedSize, amount, mark, {
      estCloseCost: null,
      estLiqCost: null,
      forcedSlippage: null,
      equityBefore: close.equityBefore,
      mmReqBefore: close.mmReqBefore,
      healthBefore: close.healthBefore,
      liqPriceBefore: null,
      builderFee1k: 0n,
      reason: `${FLATTEN} undoing the overshoot of close ${close.id}`,
    });
    const sent = await this.send(account, mem, signer, market, draft, {
      isBid,
      price: limitPrice(mark, isBid, Math.max(1, slippageBps), market.tickSize),
      quantity: amount,
      builder: null,
      builderFeeBpsTimes1k: 0n,
    });
    if (sent.kind === "sent" && sent.result.hash !== null) {
      await this.finalize(account, mem, { draft, market, isBid, fee: 0n, penaltyBps: 0, slippageBps }, sent.result, signer, false);
    }
    const settled = await venue.readPosition(market, owner).catch(() => null);
    const stillFlipped = settled === null || (settled.size !== 0n && sign(settled.size) !== sign(close.sizeBefore));
    if (!stillFlipped) {
      return {
        reason: `the position crossed zero by ${amount} base units; Hoax flattened its own overshoot (tx ${draft.txHash})`,
        message: `Your ${key} position crossed zero during a Hoax close. Hoax flattened its part of it and paused this account until you confirm.`,
        sizeAfter: settled?.size ?? null,
      };
    }
    const left = settled ? (settled.size < 0n ? -settled.size : settled.size) : null;
    const pendingNote = sent.kind === "unknown" ? " Its flatten was sent and is being confirmed; Hoax will not send another." : "";
    return {
      reason: `the position crossed zero by ${amount} base units and Hoax could not flatten it${draft.txHash ? ` (tx ${draft.txHash})` : ""}: close it manually`,
      message: `Your ${key} position crossed zero during a Hoax close and Hoax could not undo it${left !== null ? ` (${left} base units remain on the other side)` : ""}. Close it manually. Hoax paused this account.${pendingNote}`,
      sizeAfter: settled?.size ?? null,
    };
  }

  /**
   * Liquidations of a protected account become missed receipts. The scan
   * cursor lives in the store and moves only after the receipts are written,
   * so a restart or a failed write re-reads instead of losing events.
   */
  private async scanLiquidations(
    account: AccountRow,
    mem: AccountMemory,
    marginBank: Address,
    byPool: Map<string, MarketInfo>,
    views: PositionView[],
    policyBy: Map<string, PolicyRow>,
    equity: bigint,
    mmReq: bigint,
  ): Promise<void> {
    const { venue, store, config } = this.deps;
    if (mem.lastLiqScanAt !== null && this.now() - mem.lastLiqScanAt < config.liqScanEveryMs) return;
    mem.lastLiqScanAt = this.now();

    let from = account.liqScanFrom;
    if (from === null) {
      const head = await venue.blockNumber();
      from = head > FIRST_SCAN_LOOKBACK ? head - FIRST_SCAN_LOOKBACK : 0n;
    }
    const scan = await venue.liquidationsSince(marginBank, getAddress(account.owner), from, config.liqScanMaxBlocks);
    // Every step goes in the ledger, with its block, before anything else: the
    // tracker decides "liquidated after the close" from these, step by step.
    await store.recordLiquidations(
      scan.events.map((e) => ({ accountId: account.id, pool: e.pool, block: e.blockNumber, txHash: e.txHash, sizeDelta: e.sizeDelta })),
    );

    // A liquidation closes in steps, each its own event: one episode per market
    // is one miss. Steps that arrive in a later scan of the same episode are
    // folded in by the quiet period.
    const episodes = new Map<string, LiquidationEvent[]>();
    for (const ev of scan.events) {
      const pool = ev.pool.toLowerCase();
      const market = byPool.get(pool);
      // Only markets the trader asked Hoax to protect count as misses.
      if (!market || !policyBy.has(market.symbol)) continue;
      if (!episodes.has(pool)) {
        let last = mem.lastMissAt.get(pool);
        if (last === undefined) {
          const stored = await store.lastMissAt(account.id, market.pool);
          if (stored) last = stored.getTime();
        }
        if (last !== undefined && this.now() - last < MISS_EPISODE_MS) continue;
      }
      episodes.set(pool, [...(episodes.get(pool) ?? []), ev]);
    }

    for (const [pool, steps] of episodes) {
      const market = byPool.get(pool)!;
      const first = steps[0];
      const closed = steps.reduce((s, e) => s + e.sizeDelta, 0n);
      const view = views.find((v) => v.market.pool.toLowerCase() === pool);
      const policy = policyBy.get(market.symbol);
      const last = mem.lastHealth;
      const reason = account.paused
        ? "Hoax was paused"
        : policy && !policy.enabled
          ? "protection was off for this market"
          : policy && last !== null && last > policy.triggerHealth - policy.triggerMargin
            ? `the price gapped from health ${last.toFixed(3)} straight through the trigger to liquidation`
            : "liquidated before Hoax could act";
      await this.writeReceipt(account, {
        market,
        side: closed > 0n ? "short" : "long",
        outcome: "missed",
        reason,
        blockNumber: first.blockNumber,
        txHash: first.txHash,
        sizeBefore: view ? view.size - closed : -closed,
        sizeAfter: view?.size ?? null,
        mark: first.markPrice,
        equity,
        mmReq,
        // 0 when Hoax had no reading yet: the receipt says "unknown", not "healthy".
        healthBefore: last ?? 0,
        liqPrice: view?.liqPrice ?? null,
      });
      mem.lastMissAt.set(pool, this.now());
      await this.alert(
        account,
        "missed",
        `Your ${market.symbol} position was liquidated (tx ${first.txHash}${steps.length > 1 ? ` and ${steps.length - 1} more steps` : ""}). Hoax records this as a miss.`,
      );
    }
    await store.setLiqScanFrom(account.id, scan.toBlock + 1n);
    account.liqScanFrom = scan.toBlock + 1n;
  }

  private async skipReceipt(
    account: AccountRow,
    mem: AccountMemory,
    view: PositionView,
    equity: bigint,
    mmReq: bigint,
    health: number,
    reason: string,
    alert: boolean,
    force = false,
  ): Promise<void> {
    const key = `${view.market.symbol}:${reason}`;
    const last = mem.lastSkipReceipt.get(key);
    if (!force && last !== undefined && this.now() - last < this.deps.config.skipReceiptEveryMs) return;
    mem.lastSkipReceipt.set(key, this.now());
    await this.writeReceipt(account, {
      market: view.market,
      side: view.size > 0n ? "long" : "short",
      outcome: "skipped",
      reason,
      blockNumber: null,
      txHash: null,
      sizeBefore: view.size,
      sizeAfter: view.size,
      mark: view.mark,
      equity,
      mmReq,
      healthBefore: health,
      liqPrice: view.liqPrice,
    });
    if (alert) await this.alert(account, "skipped", `Hoax did not close on ${view.market.symbol}: ${reason}.`);
  }

  /** The fields every receipt shares, version 2 (with the network). */
  private receiptBase(account: AccountRow, signer: TradingSigner | null, market: MarketInfo, side: "long" | "short", outcome: Outcome, reason: string | null): Receipt {
    return {
      version: 2,
      chainId: this.deps.venue.chainId ?? account.chainId,
      account: getAddress(account.owner),
      hoaxKey: (signer?.address ?? account.hoaxKey ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
      market: market.symbol,
      pool: market.pool,
      side,
      outcome,
      reason,
      blockNumber: null,
      txHash: null,
      sizeBefore: "0",
      sizeRequested: "0",
      sizeFilled: "0",
      sizeAfter: null,
      avgFillPrice: null,
      markAtClose: "0",
      closeCost: null,
      estCloseCost: null,
      estLiquidationCost: null,
      healthBefore: 0,
      healthAfter: null,
      liqPriceBefore: null,
      liqPriceAfter: null,
      builderFeeBpsTimes1k: 0,
      createdAt: new Date(this.now()).toISOString(),
    };
  }

  private async writeReceipt(
    account: AccountRow,
    r: {
      market: MarketInfo;
      side: "long" | "short";
      outcome: Outcome;
      reason: string;
      blockNumber: bigint | null;
      txHash: `0x${string}` | null;
      sizeBefore: bigint;
      sizeAfter: bigint | null;
      mark: bigint;
      equity: bigint;
      mmReq: bigint;
      healthBefore: number;
      liqPrice: bigint | null;
    },
  ): Promise<void> {
    const signer: TradingSigner | null = account.hoaxKey ? await this.deps.keys.get(account.hoaxKey) : null;
    const receipt: Receipt = {
      ...this.receiptBase(account, signer, r.market, r.side, r.outcome, r.reason),
      blockNumber: r.blockNumber?.toString() ?? null,
      txHash: r.txHash,
      sizeBefore: r.sizeBefore.toString(),
      sizeAfter: r.sizeAfter?.toString() ?? null,
      markAtClose: r.mark.toString(),
      healthBefore: receiptHealth(r.healthBefore) ?? 0,
      liqPriceBefore: r.liqPrice?.toString() ?? null,
    };
    const signed = signer ? await signReceipt(signer, receipt) : null;
    await this.deps.store.insertAction({
      id: randomUUID(),
      accountId: account.id,
      owner: account.owner,
      market: r.market.symbol,
      pool: r.market.pool,
      side: r.side,
      block: r.blockNumber,
      txHash: r.outcome === "missed" ? null : r.txHash,
      txNonce: null,
      sizeBefore: r.sizeBefore,
      sizeRequested: 0n,
      sizeFilled: 0n,
      sizeAfter: r.sizeAfter,
      avgPrice: null,
      mark: r.mark,
      cost: null,
      estCloseCost: null,
      estLiqCost: null,
      forcedSlippage: null,
      equityBefore: r.equity,
      mmReqBefore: r.mmReq,
      healthBefore: r.healthBefore,
      healthAfter: null,
      liqPriceBefore: r.liqPrice,
      liqPriceAfter: null,
      builderFee1k: 0n,
      outcome: r.outcome,
      reason: r.outcome === "missed" ? `${r.reason} (liquidation tx ${r.txHash})` : r.reason,
      receipt,
      receiptHash: signed?.hash ?? "",
      signature: signed?.signature ?? null,
    });
  }

  private async pause(account: AccountRow, message: string): Promise<void> {
    await this.deps.store.setPaused(account.id, true);
    account.paused = true;
    await this.alert(account, "paused", message);
  }

  private async alert(account: AccountRow, kind: string, message: string): Promise<void> {
    this.deps.log.warn(`alert: ${message}`, { account: account.owner, kind });
    await this.deps.store.insertAlert({ accountId: account.id, kind, message });
  }
}

/**
 * Health as a receipt carries it. A flat account has no ratio; JSON (and the
 * database's JSONB) cannot hold Infinity, and the signed hash must match the
 * stored receipt byte for byte, so it is null.
 */
function receiptHealth(h: number): number | null {
  return Number.isFinite(h) ? h : null;
}

/** What the close cost against the mark: price given up on each fill, plus fees on notional. */
export function closeCost(fills: Fill[], mark: bigint, isBid: boolean, market: MarketInfo, builderFee1k: bigint): bigint {
  const one = 10n ** BigInt(market.baseDecimals);
  let cost = 0n;
  let qty = 0n;
  for (const f of fills) {
    cost += ((isBid ? f.price - mark : mark - f.price) * f.quantity) / one;
    qty += f.quantity;
  }
  const n = notional(qty, mark, market.baseDecimals);
  cost += (n * (BigInt(market.takerFeeBpsTimes1k) + builderFee1k)) / 10_000_000n;
  return cost;
}
