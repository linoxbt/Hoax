import type { Outcome, Policy, Receipt, Resolution, Side } from "@hoax/core";

/**
 * "unlinked": the trader removed the key on chain. "retired": a newer
 * registration for the same owner took over; its key may still be linked, but
 * Hoax never uses it again.
 */
export type AccountStatus = "pending_key" | "pending_link" | "active" | "unlinked" | "retired";

export interface AccountRow {
  id: string;
  /** Lowercase dreamDEX wallet address. */
  owner: string;
  /** The network the account trades on: 50383 (Hideki) or 50312 (Shannon). */
  chainId: number;
  /** Lowercase Hoax key address; null until the watcher has made it. */
  hoaxKey: string | null;
  status: AccountStatus;
  /** Effective builder approval, bps x 1000. */
  builderApproval1k: bigint;
  paused: boolean;
  linkedAt: Date | null;
  createdAt: Date;
  /** The next block the liquidation scan reads from; null until the engine first scans. */
  liqScanFrom: bigint | null;
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
  /** The nonce the order's transaction was signed with, when Hoax sent one. */
  txNonce: number | null;
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
  /** Infinity when the account had no maintenance requirement. */
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
  /** The signed record of the resolution, once resolved. */
  resolution: Resolution | null;
  resolutionHash: string | null;
  resolutionSignature: string | null;
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
  /** Closes that filled something (a reverted or empty order is not an action taken). */
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

export type DripReservation =
  | { ok: true; id: string }
  | { ok: false; reason: "key-cap" | "daily-cap" | "recent" };

export interface HeartbeatRow {
  service: string;
  info: Record<string, unknown>;
  beatAt: Date;
}

export interface Store {
  /**
   * Register an owner on a network (Hideki, 50383, unless given). When a
   * registration for that owner and network is already waiting for its key or
   * link, that one comes back instead and nothing is created.
   */
  createAccount(a: { id: string; owner: string; chainId?: number }): Promise<AccountRow>;
  getAccount(id: string): Promise<AccountRow | null>;
  /** The active account for an owner, else the newest registration. */
  /** The owner's account on one network (Hideki unless given): the active one, else the newest. */
  getAccountByOwner(owner: string, chainId?: number): Promise<AccountRow | null>;
  /** Accounts in a status, on one network when chainId is given. */
  listAccounts(status: AccountStatus, chainId?: number): Promise<AccountRow[]>;
  setHoaxKey(id: string, hoaxKey: string): Promise<void>;
  setStatus(id: string, status: AccountStatus): Promise<void>;
  setPaused(id: string, paused: boolean): Promise<void>;
  setBuilderApproval(id: string, approval1k: bigint): Promise<void>;
  setLiqScanFrom(id: string, block: bigint): Promise<void>;

  upsertPolicy(accountId: string, market: string, policy: Policy): Promise<PolicyRow>;
  listPolicies(accountId: string): Promise<PolicyRow[]>;

  insertHealthTicks(rows: Omit<HealthTickRow, "createdAt">[]): Promise<void>;
  /** The newest tick per market for an account. */
  latestHealth(accountId: string): Promise<HealthTickRow[]>;
  pruneHealthTicks(olderThan: Date): Promise<number>;

  /** Insert an action, or replace the one with this id (keeping its createdAt). */
  insertAction(a: NewAction): Promise<ActionRow>;
  updateActionOutcome(id: string, outcome: Outcome, reason?: string | null): Promise<void>;
  getAction(id: string): Promise<ActionRow | null>;
  /** Newest first; on one network when chainId is given. */
  listActions(opts: { owner?: string; chainId?: number; limit: number }): Promise<ActionRow[]>;
  /** Orders sent whose result is not confirmed yet. */
  listUnconfirmedActions(accountId: string): Promise<ActionRow[]>;
  /** Actions still waiting on their counterfactual, on one network when chainId is given. */
  listPendingActions(chainId?: number): Promise<ActionRow[]>;
  /** Record liquidation events (each once, however often it is scanned). */
  recordLiquidations(rows: Array<{ accountId: string; pool: string; block: bigint; txHash: string; sizeDelta: bigint }>): Promise<void>;
  /**
   * Whether the account was liquidated on this pool at or after `afterBlock`
   * (the close's own block counts: within a block the order is unknown, and
   * a save is never credited on a guess).
   */
  liquidatedAfter(accountId: string, pool: string, afterBlock: bigint): Promise<boolean>;
  /**
   * When Hoax last sent an order for this owner on this market and network
   * that filled or may have (not a revert or an empty fill: those back off,
   * they do not start the cooldown), on the engine's own clock (the receipt's
   * createdAt), across re-registrations.
   */
  lastActionAt(owner: string, chainId: number, market: string): Promise<Date | null>;
  /** Unconfirmed orders for an owner on a network, from every registration it has had. */
  listUnconfirmedForOwner(owner: string, chainId: number): Promise<ActionRow[]>;
  /** Unconfirmed orders on a network, whatever the account's status now. */
  listUnconfirmedOnChain(chainId?: number): Promise<ActionRow[]>;
  /** When the newest "missed" receipt on this pool was written. */
  lastMissAt(accountId: string, pool: string): Promise<Date | null>;

  upsertCounterfactual(c: CounterfactualRow): Promise<void>;
  getCounterfactual(actionId: string): Promise<CounterfactualRow | null>;
  getCounterfactuals(actionIds: string[]): Promise<Map<string, CounterfactualRow>>;

  insertAlert(a: { accountId: string; kind: string; message: string }): Promise<void>;
  listAlerts(accountId: string, limit: number): Promise<AlertRow[]>;

  /**
   * Reserve a gas drip atomically against the caps (per key and per network,
   * over the last `windowMs`), refusing when this key had one within `minGapMs`.
   * A reservation counts towards the caps until it is cancelled.
   */
  reserveDrip(r: {
    hoaxKey: string;
    chainId: number | null;
    amount: bigint;
    perKeyCap: bigint;
    dailyCap: bigint;
    windowMs: number;
    minGapMs: number;
  }): Promise<DripReservation>;
  completeDrip(id: string, txHash: string): Promise<void>;
  /** The drip was never sent: release its reservation. */
  cancelDrip(id: string): Promise<void>;
  dripsSince(since: Date, opts?: { hoaxKey?: string; chainId?: number | null }): Promise<bigint>;

  stats(): Promise<Stats>;

  /**
   * Count a hit on a rate-limit bucket and return the hits in the window, this
   * one included. A hit that is already over `max` is not stored, so a flood of
   * refused requests does not grow the table.
   */
  rateHit(bucket: string, windowMs: number, max: number): Promise<number>;
  pruneRateHits(olderThan: Date): Promise<number>;

  /** Spend a sign-in nonce: true the first time, false ever after (until it expires). */
  useNonce(nonce: string, expiresAt: Date): Promise<boolean>;
  pruneNonces(now: Date): Promise<number>;

  /** End every session this wallet was issued before `before`. */
  revokeSessions(wallet: string, before: Date): Promise<void>;
  /** Sessions issued to this wallet before this moment are refused; null when none were revoked. */
  sessionsRevokedBefore(wallet: string): Promise<Date | null>;

  /** Record that a service is alive, with whatever it reports about itself. */
  beat(service: string, info: Record<string, unknown>): Promise<void>;
  lastBeat(service: string): Promise<HeartbeatRow | null>;

  /**
   * Take a named lease for the life of this store's connection (one engine per
   * network). False when another process holds it.
   */
  acquireLease(name: string): Promise<boolean>;

  close(): Promise<void>;
}
