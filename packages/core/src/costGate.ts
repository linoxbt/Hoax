// Is closing now cheaper than being liquidated?
//
//   C_close = c * n                  what the close costs (spread, slippage, fees)
//   C_liq   = p * N + S_forced       what liquidation would cost
//
// p is the LiquidationEngine penalty rate and N the position's notional at the
// liquidation price. S_forced is the slippage of a forced close, read from the
// book's current depth and never less than the engine's minimum spread. Hoax
// acts only when C_close <= lambda * C_liq.

import type { BookLevel, LiquidationParams, MarketParams, Side } from "./types.ts";
import { abs, notional, toFloat } from "./units.ts";

export interface BookWalk {
  /** Raw base units the book can absorb within the limit (all of it when no limit). */
  filled: bigint;
  /** Volume-weighted price of what fills, 18 decimals; 0 when nothing fills. */
  avgPrice: bigint;
  /** Price of the last level touched. */
  worstPrice: bigint;
}

/**
 * Walk `levels` (best first) for `qty`. A limit stops the walk at the first level
 * past it: for a sell into bids, levels below `limit`; for a buy into asks, above.
 */
export function walkBook(levels: BookLevel[], qty: bigint, opts: { isBid: boolean; limit?: bigint }): BookWalk {
  let remaining = qty;
  let filled = 0n;
  let quote = 0n;
  let worst = 0n;
  for (const level of levels) {
    if (remaining <= 0n) break;
    if (opts.limit !== undefined) {
      const beyond = opts.isBid ? level.price > opts.limit : level.price < opts.limit;
      if (beyond) break;
    }
    const take = level.quantity < remaining ? level.quantity : remaining;
    filled += take;
    quote += take * level.price;
    remaining -= take;
    worst = level.price;
  }
  return { filled, avgPrice: filled > 0n ? quote / filled : 0n, worstPrice: worst };
}

export interface CloseCostEstimate {
  /** Quote cost in 18-decimal units: (mark vs average fill) x qty plus fees. Never negative. */
  cost: bigint;
  /** cost / notional at mark. */
  rate: number;
  avgPrice: bigint;
  /** Raw base units the book can fill within the slippage limit. */
  fillable: bigint;
  /** Fee part of `cost`. */
  fees: bigint;
}

/**
 * Cost of closing `qty` of a `side` position now. Closing a long sells into the
 * bids; closing a short buys from the asks.
 */
export function estimateCloseCost(args: {
  side: Side;
  qty: bigint;
  mark: bigint;
  /** The side of the book the close takes from: bids for a long, asks for a short. */
  levels: BookLevel[];
  market: MarketParams;
  limitPrice?: bigint;
  builderFeeBpsTimes1k?: number;
}): CloseCostEstimate {
  const { side, qty, mark, market } = args;
  const isBid = side === "short";
  const walk = walkBook(args.levels, qty, { isBid, limit: args.limitPrice });
  const n = notional(qty, mark, market.baseDecimals);
  const feeRate1k = BigInt(market.takerFeeBpsTimes1k + (args.builderFeeBpsTimes1k ?? 0));
  const fees = (n * feeRate1k) / 10_000_000n;

  // What fills pays the book's prices; anything the book cannot fill within the
  // limit is priced at the limit (or the worst level seen), the worst case the
  // IOC accepts.
  const unfilled = qty - walk.filled;
  const fallback = args.limitPrice ?? (walk.worstPrice > 0n ? walk.worstPrice : mark);
  const fillQuote = walk.avgPrice * walk.filled + fallback * unfilled;
  const avgPrice = qty > 0n ? fillQuote / qty : 0n;
  const perUnitLoss = isBid ? avgPrice - mark : mark - avgPrice;
  let slip = (perUnitLoss * qty) / 10n ** BigInt(market.baseDecimals);
  if (slip < 0n) slip = 0n;

  const cost = slip + fees;
  const rate = n > 0n ? toFloat(cost) / toFloat(n) : 0;
  return { cost, rate, avgPrice, fillable: walk.filled, fees };
}

export interface LiquidationCostEstimate {
  /** p * N, 18-decimal quote units. */
  penalty: bigint;
  /** S_forced, 18-decimal quote units. */
  forcedSlippage: bigint;
  /** penalty + forcedSlippage. */
  cost: bigint;
  /** Notional at the liquidation price. */
  notionalAtLiquidation: bigint;
}

export function estimateLiquidationCost(args: {
  side: Side;
  positionSize: bigint;
  mark: bigint;
  /** Liquidation price from the chain; the mark is used when it is unknown. */
  liquidationPrice: bigint | null;
  levels: BookLevel[];
  market: MarketParams;
  liquidation: LiquidationParams;
}): LiquidationCostEstimate {
  const size = abs(args.positionSize);
  const price = args.liquidationPrice && args.liquidationPrice > 0n ? args.liquidationPrice : args.mark;
  const N = notional(size, price, args.market.baseDecimals);
  const penalty = (N * BigInt(args.liquidation.penaltyBps)) / 10_000n;

  // The forced close walks the same book for the whole position. The book's
  // shape today stands in for its shape at the liquidation price.
  const close = estimateCloseCost({
    side: args.side,
    qty: size,
    mark: args.mark,
    levels: args.levels,
    market: { ...args.market, takerFeeBpsTimes1k: 0 },
  });
  const bookSlip = (close.cost * N) / maxOne(notional(size, args.mark, args.market.baseDecimals));
  const minSpread = (N * BigInt(args.liquidation.minSpreadBps)) / 10_000n;
  const forcedSlippage = bookSlip > minSpread ? bookSlip : minSpread;
  return { penalty, forcedSlippage, cost: penalty + forcedSlippage, notionalAtLiquidation: N };
}

function maxOne(x: bigint): bigint {
  return x > 0n ? x : 1n;
}

export interface GateResult {
  pass: boolean;
  closeCost: bigint;
  liquidationCost: bigint;
  lambda: number;
}

export function costGate(closeCost: bigint, liquidationCost: bigint, lambda: number): GateResult {
  // closeCost <= lambda * liquidationCost, in integers (lambda to 1e6 precision).
  const lambda1e6 = BigInt(Math.round(lambda * 1_000_000));
  const pass = closeCost * 1_000_000n <= liquidationCost * lambda1e6;
  return { pass, closeCost, liquidationCost, lambda };
}
