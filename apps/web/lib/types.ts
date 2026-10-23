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
  chainId: number;
  network: { id: number; key: "shannon" | "hideki"; name: string; explorer: string };
  /** Whether the Hoax engine can protect accounts on this network yet. */
  protectable: boolean;
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
  links: Record<string, boolean> | null;
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

/** One dreamDEX account a wallet can trade from, with its live margin summary. */
export interface WalletAccountJson {
  chainId: number;
  network: "shannon" | "hideki";
  networkName: string;
  address: string;
  via: "owner" | "derived";
  equity: string | null;
  mmReq: string | null;
  health: number | null;
  positions: number;
  marginError: string | null;
}

export interface WalletJson {
  wallet: string;
  /** STT on Hideki, where the Hoax key's gas is paid. */
  walletBalance: string | null;
  balances: Record<string, string | null>;
  /** Every account found, open positions first. */
  accounts: WalletAccountJson[];
  primary: string | null;
  primaryChain: number | null;
  margin: { equity: string; mmReq: string; health: number | null; positions: number } | null;
  marginError: string | null;
  /** False when the accounts indexer did not answer and only wallet-derived accounts were checked. */
  indexed: boolean;
}

export interface MarketJson {
  symbol: string;
  baseSymbol: string;
  pool: string;
  mark: string | null;
  markOk: boolean;
  maintenanceMarginBps: number;
  minQuantity: string;
  baseDecimals: number;
}

export interface EngineJson {
  online: boolean;
  mode: "demo" | "live";
  lastBeatAt: string | null;
  ageSec: number | null;
  info: Record<string, unknown> | null;
}

export interface LinkTxJson {
  to: string;
  data: string;
  value: string;
  from: string;
  gas: string | null;
  calls: Array<{ to: string; label: string }>;
  markets: number;
  hoaxKey: string;
}
