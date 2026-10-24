// The same Store in memory: for tests and the replay demo, which run without Postgres.

import type { Outcome, Policy } from "@hoax/core";
import type {
  AccountRow,
  AccountStatus,
  ActionRow,
  AlertRow,
  CounterfactualRow,
  DripReservation,
  HealthTickRow,
  HeartbeatRow,
  NewAction,
  PolicyRow,
  Stats,
  Store,
} from "./store.ts";

export class MemoryStore implements Store {
  accounts = new Map<string, AccountRow>();
  policies = new Map<string, PolicyRow>();
  ticks: HealthTickRow[] = [];
  actions = new Map<string, ActionRow>();
  counterfactuals = new Map<string, CounterfactualRow>();
  alerts: AlertRow[] = [];
  drips: Array<{ id: string; hoaxKey: string; chainId: number | null; amount: bigint; txHash: string | null; at: Date }> = [];
  private dripSeq = 0;
  private leases = new Set<string>();
  rateHits = new Map<string, number[]>();

  async createAccount(a: { id: string; owner: string; chainId?: number }): Promise<AccountRow> {
    const owner = a.owner.toLowerCase();
    const chainId = a.chainId ?? 50383;
    for (const other of this.accounts.values()) {
      if (other.owner === owner && other.chainId === chainId && (other.status === "pending_key" || other.status === "pending_link")) {
        return { ...other };
      }
    }
    const row: AccountRow = {
      id: a.id,
      owner,
      chainId,
      hoaxKey: null,
      status: "pending_key",
      builderApproval1k: 0n,
      paused: false,
      linkedAt: null,
      createdAt: new Date(),
      liqScanFrom: null,
    };
    this.accounts.set(row.id, row);
    return { ...row };
  }

  async getAccount(id: string) {
    const a = this.accounts.get(id);
    return a ? { ...a } : null;
  }

  async getAccountByOwner(owner: string, chainId = 50383) {
    const rows = [...this.accounts.values()].filter((a) => a.owner === owner.toLowerCase() && a.chainId === chainId);
    const active = rows.find((a) => a.status === "active");
    if (active) return { ...active };
    rows.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
    return rows[0] ? { ...rows[0] } : null;
  }

  async listAccounts(status: AccountStatus, chainId?: number) {
    return [...this.accounts.values()].filter((a) => a.status === status && (chainId === undefined || a.chainId === chainId)).map((a) => ({ ...a }));
  }

  private patch(id: string, p: Partial<AccountRow>) {
    const a = this.accounts.get(id);
    if (a) Object.assign(a, p);
  }

  async setHoaxKey(id: string, hoaxKey: string) {
    this.patch(id, { hoaxKey: hoaxKey.toLowerCase(), status: "pending_link" });
  }

  async setStatus(id: string, status: AccountStatus) {
    const a = this.accounts.get(id);
    if (!a) return;
    if (status === "active") {
      for (const other of this.accounts.values()) {
        if (other.owner === a.owner && other.chainId === a.chainId && other.id !== id && other.status === "active") {
          throw new Error("owner already has an active account on this network");
        }
      }
    }
    this.patch(id, { status, linkedAt: status === "active" ? new Date() : a.linkedAt });
  }

  async setPaused(id: string, paused: boolean) {
    this.patch(id, { paused });
  }

  async setBuilderApproval(id: string, approval1k: bigint) {
    this.patch(id, { builderApproval1k: approval1k });
  }

  async setLiqScanFrom(id: string, block: bigint) {
    this.patch(id, { liqScanFrom: block });
  }

  async upsertPolicy(accountId: string, market: string, policy: Policy) {
    const row: PolicyRow = { ...policy, accountId, market, updatedAt: new Date() };
    this.policies.set(`${accountId}:${market}`, row);
    return { ...row };
  }

  async listPolicies(accountId: string) {
    return [...this.policies.values()].filter((p) => p.accountId === accountId).map((p) => ({ ...p }));
  }

  async insertHealthTicks(rows: Omit<HealthTickRow, "createdAt">[]) {
    const now = new Date();
    for (const r of rows) this.ticks.push({ ...r, createdAt: now });
  }

  async latestHealth(accountId: string) {
    const latest = new Map<string, HealthTickRow>();
    for (const t of this.ticks) {
      if (t.accountId !== accountId) continue;
      const prev = latest.get(t.market);
      if (!prev || t.createdAt >= prev.createdAt) latest.set(t.market, t);
    }
    return [...latest.values()].map((t) => ({ ...t }));
  }

  async pruneHealthTicks(olderThan: Date) {
    const before = this.ticks.length;
    this.ticks = this.ticks.filter((t) => t.createdAt >= olderThan);
    return before - this.ticks.length;
  }

  async insertAction(a: NewAction) {
    const prev = this.actions.get(a.id);
    const row: ActionRow = { ...a, owner: a.owner.toLowerCase(), createdAt: prev?.createdAt ?? new Date() };
    this.actions.set(row.id, row);
    return { ...row };
  }

  async updateActionOutcome(id: string, outcome: Outcome, reason?: string | null) {
    const a = this.actions.get(id);
    if (!a) return;
    a.outcome = outcome;
    if (reason !== undefined) a.reason = reason;
  }

  async getAction(id: string) {
    const a = this.actions.get(id);
    return a ? { ...a } : null;
  }

  async listActions(opts: { owner?: string; chainId?: number; limit: number }) {
    return [...this.actions.values()]
      .filter((a) => !opts.owner || a.owner === opts.owner.toLowerCase())
      .filter((a) => opts.chainId === undefined || this.accounts.get(a.accountId)?.chainId === opts.chainId)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
      .slice(0, Math.max(1, Math.min(500, Math.floor(opts.limit))))
      .map((a) => ({ ...a }));
  }

  async listUnconfirmedActions(accountId: string) {
    return [...this.actions.values()]
      .filter((a) => a.accountId === accountId && a.outcome === "unconfirmed")
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
      .map((a) => ({ ...a }));
  }

  async listPendingActions(chainId?: number) {
    return [...this.actions.values()]
      .filter((a) => a.outcome === "pending" && (chainId === undefined || this.accounts.get(a.accountId)?.chainId === chainId))
      .map((a) => ({ ...a }));
  }

  liquidations = new Map<string, { accountId: string; pool: string; block: bigint; txHash: string; sizeDelta: bigint }>();

  async recordLiquidations(rows: Array<{ accountId: string; pool: string; block: bigint; txHash: string; sizeDelta: bigint }>) {
    for (const r of rows) {
      const k = `${r.accountId}:${r.pool.toLowerCase()}:${r.txHash}:${r.sizeDelta}`;
      if (!this.liquidations.has(k)) this.liquidations.set(k, { ...r, pool: r.pool.toLowerCase() });
    }
  }

  async liquidatedAfter(accountId: string, pool: string, afterBlock: bigint) {
    for (const l of this.liquidations.values()) {
      if (l.accountId === accountId && l.pool === pool.toLowerCase() && l.block >= afterBlock) return true;
    }
    return false;
  }

  async listUnconfirmedForOwner(owner: string, chainId: number) {
    return [...this.actions.values()]
      .filter((a) => a.outcome === "unconfirmed" && a.owner === owner.toLowerCase() && this.accounts.get(a.accountId)?.chainId === chainId)
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
      .map((a) => ({ ...a }));
  }

  async listUnconfirmedOnChain(chainId?: number) {
    return [...this.actions.values()]
      .filter((a) => a.outcome === "unconfirmed" && (chainId === undefined || this.accounts.get(a.accountId)?.chainId === chainId))
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
      .map((a) => ({ ...a }));
  }

  private nonces = new Map<string, Date>();

  async useNonce(nonce: string, expiresAt: Date) {
    if (this.nonces.has(nonce)) return false;
    this.nonces.set(nonce, expiresAt);
    return true;
  }

  async pruneNonces(now: Date) {
    let n = 0;
    for (const [k, exp] of this.nonces) if (exp < now) this.nonces.delete(k), n++;
    return n;
  }

  async rateHit(bucket: string, windowMs: number, max: number) {
    const now = Date.now();
    const hits = (this.rateHits.get(bucket) ?? []).filter((t) => now - t < windowMs);
    const before = hits.length;
    if (before < max) hits.push(now);
    this.rateHits.set(bucket, hits);
    return before + 1;
  }

  async pruneRateHits(olderThan: Date) {
    let n = 0;
    for (const [bucket, hits] of this.rateHits) {
      const kept = hits.filter((t) => t >= olderThan.getTime());
      n += hits.length - kept.length;
      if (kept.length === 0) this.rateHits.delete(bucket);
      else this.rateHits.set(bucket, kept);
    }
    return n;
  }

  async lastActionAt(owner: string, chainId: number, market: string) {
    let last: Date | null = null;
    for (const a of this.actions.values()) {
      if (a.owner !== owner.toLowerCase() || a.market !== market || !a.txHash || a.outcome === "missed") continue;
      if (this.accounts.get(a.accountId)?.chainId !== chainId) continue;
      const ms = Date.parse(a.receipt.createdAt);
      if (!Number.isFinite(ms)) continue; // as Postgres: no receipt time, no cooldown
      const at = new Date(ms);
      if (!last || at > last) last = at;
    }
    return last;
  }

  async lastMissAt(accountId: string, pool: string) {
    let last: Date | null = null;
    for (const a of this.actions.values()) {
      if (a.accountId === accountId && a.pool.toLowerCase() === pool.toLowerCase() && a.outcome === "missed" && (!last || a.createdAt > last)) {
        last = a.createdAt;
      }
    }
    return last;
  }

  async upsertCounterfactual(c: CounterfactualRow) {
    this.counterfactuals.set(c.actionId, { ...c });
  }

  async getCounterfactual(actionId: string) {
    const c = this.counterfactuals.get(actionId);
    return c ? { ...c } : null;
  }

  async getCounterfactuals(actionIds: string[]) {
    const out = new Map<string, CounterfactualRow>();
    for (const id of actionIds) {
      const c = this.counterfactuals.get(id);
      if (c) out.set(id, { ...c });
    }
    return out;
  }

  async insertAlert(a: { accountId: string; kind: string; message: string }) {
    this.alerts.push({ id: this.alerts.length + 1, ...a, createdAt: new Date(), seen: false });
  }

  async listAlerts(accountId: string, limit: number) {
    return this.alerts
      .filter((a) => a.accountId === accountId)
      .sort((x, y) => y.id - x.id)
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }

  /** For tests: the clock reservations are stamped and windowed by. */
  now: () => number = Date.now;

  async reserveDrip(r: {
    hoaxKey: string;
    chainId: number | null;
    amount: bigint;
    perKeyCap: bigint;
    dailyCap: bigint;
    windowMs: number;
    minGapMs: number;
  }): Promise<DripReservation> {
    // Single-threaded: check and reserve happen with nothing in between.
    const key = r.hoaxKey.toLowerCase();
    const now = this.now();
    const recent = this.drips.filter((d) => now - d.at.getTime() < r.windowMs);
    const mine = recent.filter((d) => d.hoaxKey === key);
    const last = mine.reduce((m, d) => Math.max(m, d.at.getTime()), -Infinity);
    if (now - last < r.minGapMs) return { ok: false, reason: "recent" };
    if (mine.reduce((s, d) => s + d.amount, 0n) + r.amount > r.perKeyCap) return { ok: false, reason: "key-cap" };
    const total = recent.filter((d) => d.chainId === r.chainId).reduce((s, d) => s + d.amount, 0n);
    if (total + r.amount > r.dailyCap) return { ok: false, reason: "daily-cap" };
    const id = String(++this.dripSeq);
    this.drips.push({ id, hoaxKey: key, chainId: r.chainId, amount: r.amount, txHash: null, at: new Date(now) });
    return { ok: true, id };
  }

  async completeDrip(id: string, txHash: string) {
    const d = this.drips.find((x) => x.id === id);
    if (d) d.txHash = txHash;
  }

  async cancelDrip(id: string) {
    this.drips = this.drips.filter((d) => !(d.id === id && d.txHash === null));
  }

  async dripsSince(since: Date, opts: { hoaxKey?: string; chainId?: number | null } = {}) {
    return this.drips
      .filter((d) => d.at >= since && (!opts.hoaxKey || d.hoaxKey === opts.hoaxKey.toLowerCase()))
      .filter((d) => opts.chainId === undefined || d.chainId === opts.chainId)
      .reduce((s, d) => s + d.amount, 0n);
  }

  async stats(): Promise<Stats> {
    const actions = [...this.actions.values()];
    let savedEquity = 0n;
    for (const a of actions) {
      if (a.outcome !== "saved") continue;
      savedEquity += this.counterfactuals.get(a.id)?.preserved ?? 0n;
    }
    return {
      accountsProtected: [...this.accounts.values()].filter((a) => a.status === "active" && !a.paused).length,
      actionsTaken: actions.filter((a) => a.sizeFilled > 0n).length,
      saves: actions.filter((a) => a.outcome === "saved").length,
      savedEquity,
      insuranceCost: actions.filter((a) => a.outcome === "not-needed").reduce((s, a) => s + (a.cost ?? 0n), 0n),
      misses: actions.filter((a) => a.outcome === "missed").length,
      conflicts: actions.filter((a) => a.outcome === "conflict").length,
      pending: actions.filter((a) => a.outcome === "pending").length,
    };
  }

  private revocations = new Map<string, Date>();

  async revokeSessions(wallet: string, before: Date) {
    const k = wallet.toLowerCase();
    const prev = this.revocations.get(k);
    this.revocations.set(k, prev && prev > before ? prev : before);
  }

  async sessionsRevokedBefore(wallet: string) {
    const d = this.revocations.get(wallet.toLowerCase());
    return d ? new Date(d) : null;
  }

  private beats = new Map<string, HeartbeatRow>();

  async beat(service: string, info: Record<string, unknown>) {
    this.beats.set(service, { service, info: { ...info }, beatAt: new Date() });
  }

  async lastBeat(service: string) {
    const b = this.beats.get(service);
    return b ? { ...b, info: { ...b.info } } : null;
  }

  async acquireLease(name: string) {
    if (this.leases.has(name)) return false;
    this.leases.add(name);
    return true;
  }

  async close() {
    this.leases.clear();
  }
}
