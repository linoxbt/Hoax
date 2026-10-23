// JSON shapes the API returns: bigints arrive as decimal strings.

export type Outcome = "saved" | "not-needed" | "missed" | "conflict" | "skipped" | "pending";

export interface PolicyJson {
  market: string;
  triggerHealth: number;
  targetHealth: number;
  maxClosePct: number;
  maxSlippageBps: number;
  cooldownSec: number;
  floorSize: string | null;
  lambda: number;
  triggerMargin: number;
  allowFullClose: boolean;
  enabled: boolean;
}

export interface PositionJson {
  market: string;
  baseSymbol: string;
  pool: string;
  baseDecimals: number;
  size: string;
  side: "long" | "short";
  mark: string;
  markOk: boolean;
  liqPrice: string | null;
  health: number | null;
  equity: string;
  mmReq: string;
  source: "chain" | "watcher";
}

export interface AccountJson {
  owner: string;
  account: {
    id: string;
    status: "pending_key" | "pending_link" | "active" | "unlinked";
    hoaxKey: string | null;
    paused: boolean;
    linkedAt: string | null;
    builderApproval1k: string;
    createdAt: string;
  } | null;
  isOwner: boolean;
  policies: PolicyJson[];
  positions: PositionJson[];
  alerts: Array<{ id: number; kind: string; message: string; createdAt: string }>;
  keyBalance: string | null;
  builder: { address: string | null; feeBpsTimes1k: number };
  markets: Array<{ symbol: string; pool: string; baseDecimals: number; minQuantity: string }>;
}

export interface CounterfactualJson {
  originalLiqPrice: string | null;
  reachedAtBlock: string | null;
  equityAtReach: string | null;
  equityIfLiquidated: string | null;
  preserved: string | null;
  finalOutcome: Outcome;
  resolvedAt: string | null;
}

export interface ActionJson {
  id: string;
  owner: string;
  market: string;
  pool: string;
  side: "long" | "short";
  block: string | null;
  txHash: string | null;
  sizeBefore: string;
  sizeRequested: string;
  sizeFilled: string;
  sizeAfter: string | null;
  avgPrice: string | null;
  mark: string;
  cost: string | null;
  estCloseCost: string | null;
  estLiqCost: string | null;
  healthBefore: number;
  healthAfter: number | null;
  liqPriceBefore: string | null;
  liqPriceAfter: string | null;
  builderFee1k: string;
  outcome: Outcome;
  reason: string | null;
  receiptHash: string;
  signature: string | null;
  receipt: Record<string, unknown>;
  createdAt: string;
  counterfactual: CounterfactualJson | null;
  baseDecimals?: number;
  signatureValid?: boolean | null;
  explorer?: string;
}

export interface StatsJson {
  accountsProtected: number;
  actionsTaken: number;
  saves: number;
  savedEquity: string;
  insuranceCost: string;
  misses: number;
  conflicts: number;
  pending: number;
}
