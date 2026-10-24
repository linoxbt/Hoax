// A save is only counted after the fact.
//
// For 24 hours after each close Hoax watches the mark. If it reaches the
// liquidation price the position had BEFORE the close while the reduced position
// survives, the action becomes "saved", and
//
//   equity preserved = equity the trader holds at that moment
//                    - equity they would have held after liquidation
//
// The close cost is already inside the first term (it was paid out of equity),
// so it is not subtracted a second time.
//
// The second term charges the penalty and the forced close on the whole
// position. dreamDEX liquidates in steps and can stop once the account is back
// above maintenance, so this is an upper bound on what the close preserved:
// what it saved if the move went on to liquidate the position fully. Every
// place that shows the figure says so. If the mark never gets there the
// action becomes "not-needed" and its close cost is shown as the price of
// insurance.

import type { MarketParams, Side } from "./types.ts";
import { notional } from "./units.ts";

export const COUNTERFACTUAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TrackingVerdict = "pending" | "reached" | "expired" | "liquidated";

export function evaluateTracking(args: {
  side: Side;
  originalLiquidationPrice: bigint | null;
  mark: bigint;
  /** The reduced position was liquidated after the close. */
  liquidatedSince: boolean;
  ageMs: number;
  windowMs?: number;
}): TrackingVerdict {
  if (args.liquidatedSince) return "liquidated";
  // Past the window nothing counts any more, even if the mark is there now
  // (the tracker can come back late after an outage).
  if (args.ageMs >= (args.windowMs ?? COUNTERFACTUAL_WINDOW_MS)) return "expired";
  const liq = args.originalLiquidationPrice;
  if (liq !== null && liq > 0n && args.mark > 0n) {
    const reached = args.side === "long" ? args.mark <= liq : args.mark >= liq;
    if (reached) return "reached";
  }
  return "pending";
}

export interface PreservedInput {
  /** Account equity when the mark reached the original liquidation price. */
  equityNow: bigint;
  /** Maintenance requirement just before the close. */
  mmReqBefore: bigint;
  /** Signed position size just before the close. */
  positionSizeBefore: bigint;
  /** Mark just before the close. */
  markBefore: bigint;
  originalLiquidationPrice: bigint;
  market: Pick<MarketParams, "baseDecimals" | "maintenanceMarginBps">;
  penaltyBps: number;
  /** Forced-close slippage estimated at the time of the close. */
  forcedSlippage: bigint;
}

export interface PreservedResult {
  /** Equity the unreduced account would have held at the liquidation price. */
  equityAtLiquidation: bigint;
  /** What would have been left after the penalty and the forced close. */
  equityIfLiquidated: bigint;
  preserved: bigint;
}

export function equityPreserved(input: PreservedInput): PreservedResult {
  const m = BigInt(input.market.maintenanceMarginBps);
  const nBefore = notional(input.positionSizeBefore, input.markBefore, input.market.baseDecimals);
  const nAtLiq = notional(input.positionSizeBefore, input.originalLiquidationPrice, input.market.baseDecimals);

  // At its liquidation price the unreduced account has equity equal to its
  // maintenance requirement, re-struck at that price for this market.
  const equityAtLiquidation = input.mmReqBefore - (nBefore * m) / 10_000n + (nAtLiq * m) / 10_000n;
  const penalty = (nAtLiq * BigInt(input.penaltyBps)) / 10_000n;
  let equityIfLiquidated = equityAtLiquidation - penalty - input.forcedSlippage;
  if (equityIfLiquidated < 0n) equityIfLiquidated = 0n;

  return { equityAtLiquidation, equityIfLiquidated, preserved: input.equityNow - equityIfLiquidated };
}
