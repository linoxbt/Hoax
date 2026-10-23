import type { Outcome, Policy, Receipt, Side } from "@hoax/core";

export type AccountStatus = "pending_key" | "pending_link" | "active" | "unlinked";

export interface AccountRow {
  id: string;
  /** Lowercase dreamDEX wallet address. */
  owner: string;
  /** Lowercase Hoax key address; null until the watcher has made it. */
  hoaxKey: string | null;
  status: AccountStatus;
  manageTokenHash: string;
  /** Effective builder approval, bps x 1000. */
  builderApproval1k: bigint;
  paused: boolean;
  linkedAt: Date | null;
  createdAt: Date;
}

export interface PolicyRow extends Policy {
  accountId: string;
  market: string;
  updatedAt: Date;
}

export interface HealthTickRow {
  accountId: string;
  market: string;
  block: bigint;
  /** null when the account has no maintenance requirement. */
  health: number | null;
  equity: bigint;
  mmReq: bigint;
  mark: bigint;
  markOk: boolean;
  size: bigint;
  liqPrice: bigint | null;
  createdAt: Date;
}

export interface ActionRow {
  id: string;
  accountId: string;
  owner: string;
  market: string;
  pool: string;
  side: Side;
  block: bigint | null;
  txHash: string | null;
  sizeBefore: bigint;
  sizeRequested: bigint;
  sizeFilled: bigint;
  sizeAfter: bigint | null;
  avgPrice: bigint | null;
  mark: bigint;
  cost: bigint | null;
  estCloseCost: bigint | null;
  estLiqCost: bigint | null;
  forcedSlippage: bigint | null;
  equityBefore: bigint;
  mmReqBefore: bigint;
  healthBefore: number;
  healthAfter: number | null;
  liqPriceBefore: bigint | null;
  liqPriceAfter: bigint | null;
  builderFee1k: bigint;
  outcome: Outcome;
  reason: string | null;
  receipt: Receipt;
  receiptHash: string;
  signature: string | null;
  createdAt: Date;
}

export interface CounterfactualRow {
  actionId: string;
  originalLiqPrice: bigint | null;
  reachedAtBlock: bigint | null;
  equityAtReach: bigint | null;
  equityIfLiquidated: bigint | null;
  preserved: bigint | null;
  finalOutcome: Outcome;
  resolvedAt: Date | null;
}

export interface AlertRow {
  id: number;
  accountId: string;
  kind: string;
  message: string;
  createdAt: Date;
  seen: boolean;
}

export interface Stats {
  accountsProtected: number;
  actionsTaken: number;
  saves: number;
  /** Sum of equity preserved on saved actions, 18-decimal quote units. */
  savedEquity: bigint;
  /** Sum of close costs on not-needed actions: the price of insurance. */
  insuranceCost: bigint;
  misses: number;
  conflicts: number;
  pending: number;
}

export type NewAction = Omit<ActionRow, "createdAt">;

export interface Store {
  createAccount(a: { id: string; owner: string; manageTokenHash: string }): Promise<AccountRow>;
  getAccount(id: string): Promise<AccountRow | null>;
  /** The active account for an owner, else the newest registration. */
  getAccountByOwner(owner: string): Promise<AccountRow | null>;
  listAccounts(status: AccountStatus): Promise<AccountRow[]>;
  setHoaxKey(id: string, hoaxKey: string): Promise<void>;
  setStatus(id: string, status: AccountStatus): Promise<void>;
  setPaused(id: string, paused: boolean): Promise<void>;
  setBuilderApproval(id: string, approval1k: bigint): Promise<void>;

  upsertPolicy(accountId: string, market: string, policy: Policy): Promise<PolicyRow>;
  listPolicies(accountId: string): Promise<PolicyRow[]>;

  insertHealthTicks(rows: Omit<HealthTickRow, "createdAt">[]): Promise<void>;
  /** The newest tick per market for an account. */
  latestHealth(accountId: string): Promise<HealthTickRow[]>;
  pruneHealthTicks(olderThan: Date): Promise<number>;

  insertAction(a: NewAction): Promise<ActionRow>;
  updateActionOutcome(id: string, outcome: Outcome, reason?: string | null): Promise<void>;
  getAction(id: string): Promise<ActionRow | null>;
  listActions(opts: { owner?: string; limit: number }): Promise<ActionRow[]>;
  listPendingActions(): Promise<ActionRow[]>;
  lastActionAt(accountId: string, market: string): Promise<Date | null>;

  upsertCounterfactual(c: CounterfactualRow): Promise<void>;
  getCounterfactual(actionId: string): Promise<CounterfactualRow | null>;

  insertAlert(a: { accountId: string; kind: string; message: string }): Promise<void>;
  listAlerts(accountId: string, limit: number): Promise<AlertRow[]>;

  recordDrip(hoaxKey: string, amount: bigint, txHash: string): Promise<void>;
  dripsSince(since: Date, hoaxKey?: string): Promise<bigint>;

  stats(): Promise<Stats>;
  close(): Promise<void>;
}
