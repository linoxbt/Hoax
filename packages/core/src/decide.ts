// One decision for one position: act, skip with a logged reason, or stay idle.
// Pure: every input is a value read from the chain beforehand.

import { costGate, estimateCloseCost, estimateLiquidationCost, type GateResult } from "./costGate.ts";
import { health, sizeClose, type SizingResult } from "./sizing.ts";
import type { BookLevel, LiquidationParams, MarketParams, Policy, Side } from "./types.ts";
import { abs } from "./units.ts";

export interface PositionState {
  equity: bigint;
  mmReq: bigint;
  /** Signed, raw base units. */
  positionSize: bigint;
  mark: bigint;
  /** The pool's own verdict that the mark is live. */
  markOk: boolean;
  liquidationPrice: bigint | null;
  /** Best first. */
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface DecideInput {
  nowMs: number;
  policy: Policy;
  market: MarketParams;
  state: PositionState;
  liquidation: LiquidationParams;
  /** When Hoax last closed on this position, or null. */
  lastActionAtMs: number | null;
  paused: boolean;
  /** Builder fee Hoax will attach, bps x 1000 (0 when the approval does not cover it). */
  builderFeeBpsTimes1k: number;
}

export interface ActDecision {
  type: "act";
  side: Side;
  /** Closing a long sells (isBid false); closing a short buys. */
  isBid: boolean;
  quantity: bigint;
  /** IOC limit: mark minus max slippage for a long, plus for a short, on the tick grid. */
  limitPrice: bigint;
  healthBefore: number;
  sizing: Extract<SizingResult, { kind: "close" }>;
  gate: GateResult;
  estCloseCost: bigint;
  estLiquidationCost: bigint;
  costRate: number;
}

export interface SkipDecision {
  type: "skip";
  reason: string;
  healthBefore: number;
  /** True when the trader should be told. */
  alert: boolean;
  gate?: GateResult;
}

export interface IdleDecision {
  type: "idle";
  reason: string;
  healthBefore: number;
}

export type Decision = ActDecision | SkipDecision | IdleDecision;

/** The IOC limit price: never worse than max slippage from the mark, rounded inside it. */
export function limitPrice(mark: bigint, isBid: boolean, slippageBps: number, tick: bigint): bigint {
  const slip = BigInt(Math.round(slippageBps));
  if (isBid) {
    const raw = (mark * (10_000n + slip)) / 10_000n;
    return (raw / tick) * tick; // round down: a buy pays at most this
  }
  const raw = (mark * (10_000n - slip)) / 10_000n;
  return ((raw + tick - 1n) / tick) * tick; // round up: a sell receives at least this
}

export function decide(input: DecideInput): Decision {
  const { policy, market, state } = input;
  const H = health(state.equity, state.mmReq);

  if (input.paused) return { type: "idle", reason: "paused", healthBefore: H };
  if (!policy.enabled) return { type: "idle", reason: "policy off", healthBefore: H };
  if (state.positionSize === 0n) return { type: "idle", reason: "no position", healthBefore: H };
  if (!state.markOk || state.mark <= 0n) {
    return { type: "skip", reason: "mark feed stale", healthBefore: H, alert: true };
  }
  if (!Number.isFinite(H)) return { type: "idle", reason: "no maintenance requirement", healthBefore: H };
  if (H > policy.triggerHealth - policy.triggerMargin) {
    return { type: "idle", reason: "health above trigger", healthBefore: H };
  }
  if (input.lastActionAtMs !== null && input.nowMs - input.lastActionAtMs < policy.cooldownSec * 1000) {
    return { type: "skip", reason: "cooldown", healthBefore: H, alert: false };
  }

  const side: Side = state.positionSize > 0n ? "long" : "short";
  const isBid = side === "short";
  const levels = isBid ? state.asks : state.bids;
  const limit = limitPrice(state.mark, isBid, policy.maxSlippageBps, market.tickSize);

  // The cost rate depends on the size and the size on the cost rate: start from
  // fees plus the touch, then settle in a few rounds.
  let costRate = (market.takerFeeBpsTimes1k + input.builderFeeBpsTimes1k) / 10_000_000;
  let sizing: SizingResult = { kind: "none", reason: "not sized" };
  let close = estimateCloseCost({
    side,
    qty: market.minQuantity,
    mark: state.mark,
    levels,
    market,
    limitPrice: limit,
    builderFeeBpsTimes1k: input.builderFeeBpsTimes1k,
  });
  costRate = Math.max(costRate, close.rate);
  for (let round = 0; round < 3; round++) {
    sizing = sizeClose({
      equity: state.equity,
      mmReq: state.mmReq,
      positionSize: state.positionSize,
      mark: state.mark,
      market,
      policy,
      costRate,
    });
    if (sizing.kind === "none") break;
    close = estimateCloseCost({
      side,
      qty: sizing.quantity,
      mark: state.mark,
      levels,
      market,
      limitPrice: limit,
      builderFeeBpsTimes1k: input.builderFeeBpsTimes1k,
    });
    if (Math.abs(close.rate - costRate) < 1e-6) break;
    costRate = close.rate;
  }

  if (sizing.kind === "none") return { type: "skip", reason: sizing.reason, healthBefore: H, alert: true };
  if (close.fillable === 0n) {
    return { type: "skip", reason: "no liquidity within max slippage", healthBefore: H, alert: true };
  }

  const liq = estimateLiquidationCost({
    side,
    positionSize: state.positionSize,
    mark: state.mark,
    liquidationPrice: state.liquidationPrice,
    levels,
    market,
    liquidation: input.liquidation,
  });
  const gate = costGate(close.cost, liq.cost, policy.lambda);
  if (!gate.pass) {
    return { type: "skip", reason: "close costs more than lambda x liquidation", healthBefore: H, alert: true, gate };
  }

  return {
    type: "act",
    side,
    isBid,
    quantity: sizing.quantity > abs(state.positionSize) ? abs(state.positionSize) : sizing.quantity,
    limitPrice: limit,
    healthBefore: H,
    sizing,
    gate,
    estCloseCost: close.cost,
    estLiquidationCost: liq.cost,
    costRate,
  };
}
