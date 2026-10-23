// How much to close.
//
// Health H = E / M: account equity over the account's maintenance requirement.
// Closing a notional n in one market removes m*n of the requirement (m is that
// market's maintenance rate) and costs c*n (spread, slippage and fees), so
//
//   H' = (E - c*n) / (M - m*n)
//
// and solving H' = H_target gives
//
//   n = (H_target*M - E) / (H_target*m - c)
//
// For a single-market account M = m*N and n = f*N, which is the spec's
// f = (H_target*M - E) / (H_target*M - c*N). Margin is cross on dreamDEX, so the
// general form is used: M includes every market the account holds.

import type { MarketParams, Policy } from "./types.ts";
import { abs, notional, roundDownToLot, roundUpToLot, toFloat, fromFloat } from "./units.ts";

export interface SizingInput {
  /** Account equity, 18-decimal quote units. */
  equity: bigint;
  /** Account maintenance requirement, 18-decimal quote units. */
  mmReq: bigint;
  /** Signed position size in the market being closed, raw base units. */
  positionSize: bigint;
  /** Mark price, 18-decimal quote per whole base. */
  mark: bigint;
  market: MarketParams;
  policy: Policy;
  /** Expected cost of closing, as a fraction of notional closed (0.001 = 10 bps). */
  costRate: number;
}

export type SizingResult =
  | {
      kind: "close";
      /** Raw base units to close, on the lot grid. */
      quantity: bigint;
      /** True when the whole position closes. */
      full: boolean;
      /** True when max-close-per-action bound the size, so the target is not reached in one step. */
      capped: boolean;
      /** Notional the formula asked for, before rounding, 18-decimal quote units. */
      idealNotional: bigint;
      /** Health expected after the close at this cost rate. */
      projectedHealth: number;
    }
  | { kind: "none"; reason: string };

export function health(equity: bigint, mmReq: bigint): number {
  if (mmReq <= 0n) return Number.POSITIVE_INFINITY;
  return toFloat(equity) / toFloat(mmReq);
}

/** Health after closing `qty` of the position at the given cost rate. */
export function projectHealth(
  input: Pick<SizingInput, "equity" | "mmReq" | "mark" | "market" | "costRate">,
  qty: bigint,
): number {
  const E = toFloat(input.equity);
  const M = toFloat(input.mmReq);
  const n = toFloat(notional(qty, input.mark, input.market.baseDecimals));
  const m = input.market.maintenanceMarginBps / 10_000;
  const remaining = M - m * n;
  if (remaining <= 1e-12) return Number.POSITIVE_INFINITY;
  return (E - input.costRate * n) / remaining;
}

export function sizeClose(input: SizingInput): SizingResult {
  const { market, policy, mark } = input;
  const size = abs(input.positionSize);
  if (size === 0n) return { kind: "none", reason: "no position" };
  if (mark <= 0n) return { kind: "none", reason: "no mark price" };

  const E = toFloat(input.equity);
  const M = toFloat(input.mmReq);
  const Ht = policy.targetHealth;
  const m = market.maintenanceMarginBps / 10_000;
  const c = Math.max(0, input.costRate);

  if (M <= 0) return { kind: "none", reason: "no maintenance requirement" };
  if (E / M >= Ht) return { kind: "none", reason: "health already at or above target" };
  if (Ht * m - c <= 0) {
    return { kind: "none", reason: "closing costs more per unit than it frees, so it cannot raise health" };
  }

  const nIdeal = (Ht * M - E) / (Ht * m - c);
  const idealQtyRaw = fromFloat(nIdeal / toFloat(mark), market.baseDecimals);

  let qty = roundUpToLot(idealQtyRaw, market.lotSize);
  if (qty < market.minQuantity) qty = market.minQuantity;

  const cap = roundDownToLot((size * BigInt(Math.round(policy.maxClosePct * 100))) / 10_000n, market.lotSize);
  let capped = false;
  if (qty > cap) {
    qty = cap;
    capped = true;
  }

  const floor = policy.floorSize ?? market.minQuantity;
  let full = false;
  if (qty >= size) {
    full = true;
  } else if (qty < market.minQuantity) {
    // The cap left less than the venue will accept: only a full close is possible.
    full = true;
  } else if (size - qty < floor) {
    full = true;
  }

  if (full) {
    if (!policy.allowFullClose) {
      return { kind: "none", reason: "a partial close would breach the floor size and the policy forbids a full close" };
    }
    qty = size;
    capped = false;
  }

  return {
    kind: "close",
    quantity: qty,
    full,
    capped,
    idealNotional: fromFloat(nIdeal),
    projectedHealth: projectHealth(input, qty),
  };
}
