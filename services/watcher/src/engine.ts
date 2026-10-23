// The health loop, executor and reconciler for one account at a time.
//
// Every tick: read health, positions and marks; record them; then for the
// largest protected position, decide. Only the executor sends transactions, only
// to the pool through placeOrderFor, and only as IOC. Anything uncertain fails
// closed: no order is sent on a read that errored or a mark the pool calls stale.

import { randomUUID } from "node:crypto";
import {
  clampClose,
  decide,
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
import { signReceipt, type Fill, type LiquidationEvent, type MarketInfo, type TradingSigner, type Venue } from "@hoax/chain";
import type { AccountRow, PolicyRow, Store } from "@hoax/db";
import { getAddress, type Address } from "viem";
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
}

/** Liquidation steps within this window after a miss belong to the same episode. */
const MISS_EPISODE_MS = 10 * 60_000;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  builder: null,
  builderFeeBpsTimes1k: 0n,
  dryRun: false,
  bookDepth: 20,
  staleAlertMs: 60_000,
  skipReceiptEveryMs: 5 * 60_000,
  readErrorAlertAfter: 5,
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
  lastActionAt: Map<string, number>;
  retryNoFill: Set<string>;
  staleSince: Map<string, number>;
  staleAlerted: Set<string>;
  lastSkipReceipt: Map<string, number>;
  readErrors: number;
  liqScanFrom: bigint | null;
  /** When a missed receipt was last written, per pool. */
  lastMissAt: Map<string, number>;
  lastHealth: number | null;
}

export class Engine {
  private readonly memory = new Map<string, AccountMemory>();
  private readonly approvals = new Map<string, { at: number; fee: bigint }>();
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
        liqScanFrom: null,
        lastMissAt: new Map(),
        lastHealth: null,
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
        await this.alert(account, "rpc", `Hoax could not read your account ${mem.readErrors} times in a row and is sending no orders until reads recover.`);
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

    const [margin, policies] = await Promise.all([venue.readMargin(marginBank, owner), store.listPolicies(account.id)]);
    const H = margin.mmReq > 0n ? Number(margin.equity) / Number(margin.mmReq) : Number.POSITIVE_INFINITY;

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
            venue.readFeed(market),
            venue.readLiquidationPrice(market, owner),
          ]);
          return { market, size: pos.size, mark: feed.markPrice, markOk: feed.markOk, liqPrice: liq };
        }),
    );

    await store.insertHealthTicks(
      views
        .filter((v) => v.size !== 0n)
        .map((v) => ({
          accountId: account.id,
          market: v.market.symbol,
          block: margin.blockNumber,
          health: Number.isFinite(H) ? H : null,
          equity: margin.equity,
          mmReq: margin.mmReq,
          mark: v.mark,
          markOk: v.markOk,
          size: v.size,
          liqPrice: v.liqPrice,
        })),
    );

    await this.scanLiquidations(account, mem, marginBank, byPool, views);
    mem.lastHealth = Number.isFinite(H) ? H : null;

    if (account.paused) return { kind: "idle", reason: "paused" };

    const policyBy = new Map<string, PolicyRow>(policies.map((p) => [p.market, p]));
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
      const lastAt = retrying ? null : (mem.lastActionAt.get(key) ?? (await this.lastActionFromStore(account, key, mem)));
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
      return this.execute(account, mem, view, decision, margin.equity, margin.mmReq, liquidation, fee);
    }
    return lastSkip;
  }

  private async lastActionFromStore(account: AccountRow, market: string, mem: AccountMemory): Promise<number | null> {
    const at = await this.deps.store.lastActionAt(account.id, market);
    if (at) mem.lastActionAt.set(market, at.getTime());
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
      void this.alert(account, "stale", `The ${key} mark price has been stale for over ${Math.round(this.deps.config.staleAlertMs / 1000)} s. Hoax does not act on a stale mark.`);
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

  private async execute(
    account: AccountRow,
    mem: AccountMemory,
    view: PositionView,
    decision: ActDecision,
    equityBefore: bigint,
    mmReqBefore: bigint,
    liquidation: LiquidationParams,
    fee: bigint,
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
      await this.pause(account, `Your ${key} position changed side before Hoax could act. Hoax paused this account until you confirm.`);
      return { kind: "skip", reason: "position changed side before send" };
    }
    const qty = clampClose(decision.quantity, fresh.size);

    if (config.dryRun) {
      log.info("dry run: would close", { account: owner, market: key, qty, limit: decision.limitPrice, health: decision.healthBefore });
      mem.lastActionAt.set(key, this.now());
      return { kind: "skip", reason: "dry run" };
    }

    let result;
    try {
      result = await venue.placeIocFor(signer, owner, market, {
        isBid: decision.isBid,
        price: decision.limitPrice,
        quantity: qty,
        builder: fee > 0n ? config.builder : null,
        builderFeeBpsTimes1k: fee,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("close order failed", { account: owner, market: key, error: message.slice(0, 300) });
      await this.skipReceipt(account, mem, view, equityBefore, mmReqBefore, decision.healthBefore, `order rejected: ${message.slice(0, 160)}`, true);
      return { kind: "skip", reason: "order rejected" };
    }

    if (result.noFill) {
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
    mem.lastActionAt.set(key, this.now());

    const filled = result.fills.reduce((s, f) => s + f.quantity, 0n);
    const avgPrice = filled > 0n ? result.fills.reduce((s, f) => s + f.quantity * f.price, 0n) / filled : null;
    const cost = closeCost(result.fills, view.mark, decision.isBid, market, fee);

    const [after, marginAfter, liqAfter] = await Promise.all([
      venue.readPosition(market, owner),
      venue.readMargin(market.marginBank, owner),
      venue.readLiquidationPrice(market, owner),
    ]);
    const rec = reconcile({ sizeBefore: fresh.size, requested: qty, filled, sizeAfter: after.size });
    const healthAfter = marginAfter.mmReq > 0n ? Number(marginAfter.equity) / Number(marginAfter.mmReq) : Number.POSITIVE_INFINITY;

    let outcome: Outcome = "pending";
    let reason: string | null = rec.status === "partial" ? "partial fill" : null;
    let flattenHash: string | null = null;

    if (rec.status === "flipped") {
      // Flatten the flipped amount at once, then stop and ask the trader.
      const flipIsBid = after.size < 0n;
      try {
        const flat = await venue.placeIocFor(signer, owner, market, {
          isBid: flipIsBid,
          price: limitPrice(view.mark, flipIsBid, 100, market.tickSize),
          quantity: rec.flipAmount,
          builder: null,
          builderFeeBpsTimes1k: 0n,
        });
        flattenHash = flat.hash;
      } catch (err) {
        log.error("flatten after flip failed", { account: owner, market: key, error: String(err).slice(0, 200) });
      }
      outcome = "conflict";
      reason = `position flipped by ${rec.flipAmount} base units; Hoax flattened it${flattenHash ? ` (tx ${flattenHash})` : " (flatten failed: close it manually)"}`;
      await this.pause(account, `Your ${key} position crossed zero during a Hoax close. Hoax flattened the flip and paused this account until you confirm.`);
    } else if (rec.status === "conflict") {
      outcome = "conflict";
      reason = `another trade moved the position by ${rec.externalChange} base units during the close`;
      await this.pause(account, `Another trade changed your ${key} position while Hoax was closing. Hoax paused this account until you confirm.`);
    }

    const receipt: Receipt = {
      version: 1,
      account: owner,
      hoaxKey: signer.address,
      market: key,
      pool: market.pool,
      side: decision.side,
      outcome,
      reason,
      blockNumber: result.blockNumber.toString(),
      txHash: result.hash,
      sizeBefore: fresh.size.toString(),
      sizeRequested: qty.toString(),
      sizeFilled: filled.toString(),
      sizeAfter: after.size.toString(),
      avgFillPrice: avgPrice?.toString() ?? null,
      markAtClose: view.mark.toString(),
      closeCost: cost.toString(),
      estCloseCost: decision.estCloseCost.toString(),
      estLiquidationCost: decision.estLiquidationCost.toString(),
      healthBefore: decision.healthBefore,
      healthAfter,
      liqPriceBefore: view.liqPrice?.toString() ?? null,
      liqPriceAfter: liqAfter?.toString() ?? null,
      builderFeeBpsTimes1k: Number(fee),
      createdAt: new Date(this.now()).toISOString(),
    };
    const { hash, signature } = await signReceipt(signer, receipt);
    const forcedSlippage = decision.estLiquidationCost - (notional(fresh.size, view.liqPrice ?? view.mark, market.baseDecimals) * BigInt(liquidation.penaltyBps)) / 10_000n;
    const id = randomUUID();
    await this.deps.store.insertAction({
      id,
      accountId: account.id,
      owner: account.owner,
      market: key,
      pool: market.pool,
      side: decision.side,
      block: result.blockNumber,
      txHash: result.hash,
      sizeBefore: fresh.size,
      sizeRequested: qty,
      sizeFilled: filled,
      sizeAfter: after.size,
      avgPrice,
      mark: view.mark,
      cost,
      estCloseCost: decision.estCloseCost,
      estLiqCost: decision.estLiquidationCost,
      forcedSlippage: forcedSlippage > 0n ? forcedSlippage : 0n,
      equityBefore,
      mmReqBefore,
      healthBefore: decision.healthBefore,
      healthAfter,
      liqPriceBefore: view.liqPrice,
      liqPriceAfter: liqAfter,
      builderFee1k: fee,
      outcome,
      reason,
      receipt,
      receiptHash: hash,
      signature,
    });
    if (outcome === "pending") {
      await this.deps.store.upsertCounterfactual({
        actionId: id,
        originalLiqPrice: view.liqPrice,
        reachedAtBlock: null,
        equityAtReach: null,
        equityIfLiquidated: null,
        preserved: null,
        finalOutcome: "pending",
        resolvedAt: null,
      });
    }
    log.info("closed", {
      account: owner,
      market: key,
      filled,
      tx: result.hash,
      healthBefore: decision.healthBefore.toFixed(3),
      healthAfter: Number.isFinite(healthAfter) ? healthAfter.toFixed(3) : "flat",
      outcome,
    });
    return { kind: "acted", actionId: id, outcome };
  }

  /** Liquidations of a protected account become missed receipts. */
  private async scanLiquidations(
    account: AccountRow,
    mem: AccountMemory,
    marginBank: Address,
    byPool: Map<string, MarketInfo>,
    views: PositionView[],
  ): Promise<void> {
    const { venue } = this.deps;
    const head = await venue.blockNumber();
    if (mem.liqScanFrom === null) {
      mem.liqScanFrom = head;
      return;
    }
    if (head < mem.liqScanFrom) return;
    const events = await venue.liquidationsSince(marginBank, getAddress(account.owner), mem.liqScanFrom);
    mem.liqScanFrom = head + 1n;

    // A liquidation closes in steps, each its own event: one episode per market
    // is one miss. Steps that arrive in a later scan of the same episode are
    // folded in by the quiet period.
    const episodes = new Map<string, LiquidationEvent[]>();
    for (const ev of events) {
      const pool = ev.pool.toLowerCase();
      const last = mem.lastMissAt.get(pool);
      if (last !== undefined && this.now() - last < MISS_EPISODE_MS) continue;
      episodes.set(pool, [...(episodes.get(pool) ?? []), ev]);
    }
    if (episodes.size === 0) return;
    const policies = await this.deps.store.listPolicies(account.id);

    for (const [pool, steps] of episodes) {
      const market = byPool.get(pool);
      if (!market) continue;
      mem.lastMissAt.set(pool, this.now());
      const first = steps[0];
      const closed = steps.reduce((s, e) => s + e.sizeDelta, 0n);
      const view = views.find((v) => v.market.pool.toLowerCase() === pool);
      const policy = policies.find((p) => p.market === market.symbol);
      const last = mem.lastHealth;
      const reason = account.paused
        ? "Hoax was paused"
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
        equity: 0n,
        mmReq: 0n,
        healthBefore: last ?? 0,
        liqPrice: view?.liqPrice ?? null,
      });
      await this.alert(
        account,
        "missed",
        `Your ${market.symbol} position was liquidated (tx ${first.txHash}${steps.length > 1 ? ` and ${steps.length - 1} more steps` : ""}). Hoax records this as a miss.`,
      );
    }
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
      version: 1,
      account: getAddress(account.owner),
      hoaxKey: (signer?.address ?? account.hoaxKey ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
      market: r.market.symbol,
      pool: r.market.pool,
      side: r.side,
      outcome: r.outcome,
      reason: r.reason,
      blockNumber: r.blockNumber?.toString() ?? null,
      txHash: r.txHash,
      sizeBefore: r.sizeBefore.toString(),
      sizeRequested: "0",
      sizeFilled: "0",
      sizeAfter: r.sizeAfter?.toString() ?? null,
      avgFillPrice: null,
      markAtClose: r.mark.toString(),
      closeCost: null,
      estCloseCost: null,
      estLiquidationCost: null,
      healthBefore: r.healthBefore,
      healthAfter: null,
      liqPriceBefore: r.liqPrice?.toString() ?? null,
      liqPriceAfter: null,
      builderFeeBpsTimes1k: 0,
      createdAt: new Date(this.now()).toISOString(),
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
      healthBefore: Number.isFinite(r.healthBefore) ? r.healthBefore : 0,
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

