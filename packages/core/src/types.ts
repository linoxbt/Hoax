export type Side = "long" | "short";

/** What Hoax knows about one perp market. Amounts are raw on-chain units. */
export interface MarketParams {
  symbol: string;
  pool: `0x${string}`;
  baseDecimals: number;
  /** Price increment, 18-decimal quote per whole base. */
  tickSize: bigint;
  /** Quantity increment, raw base units. */
  lotSize: bigint;
  /** Smallest order the pool accepts, raw base units. */
  minQuantity: bigint;
  maintenanceMarginBps: number;
  /** Pool taker fee in bps x 1000 (the pool's own unit). */
  takerFeeBpsTimes1k: number;
}

/** One resting price level. */
export interface BookLevel {
  price: bigint;
  quantity: bigint;
}

/** Per-position policy the trader sets. */
export interface Policy {
  /** Equity / maintenance margin at or under which Hoax acts. */
  triggerHealth: number;
  /** Equity / maintenance margin Hoax restores after a close. */
  targetHealth: number;
  /** Largest share of the position closed in one action, percent. */
  maxClosePct: number;
  /** Worst acceptable fill versus mark, bps. */
  maxSlippageBps: number;
  /** Minimum time between two closes on the same position. */
  cooldownSec: number;
  /** Never leave less than this (raw base units). null = the market minimum. */
  floorSize: bigint | null;
  /** Act only when close cost <= lambda x liquidation cost. */
  lambda: number;
  /** Act only when health is under the trigger by at least this much (stops oscillation). */
  triggerMargin: number;
  /** When a partial close would leave less than the floor, close it all (true) or do nothing (false). */
  allowFullClose: boolean;
  enabled: boolean;
}

export const DEFAULT_POLICY: Policy = {
  triggerHealth: 1.25,
  targetHealth: 1.6,
  maxClosePct: 50,
  maxSlippageBps: 30,
  cooldownSec: 30,
  floorSize: null,
  lambda: 0.5,
  triggerMargin: 0.02,
  allowFullClose: true,
  enabled: true,
};

export type Outcome = "saved" | "not-needed" | "missed" | "conflict" | "skipped" | "pending";

/** Liquidation parameters read from the LiquidationEngine. */
export interface LiquidationParams {
  penaltyBps: number;
  minSpreadBps: number;
}
