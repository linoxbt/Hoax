// The same Store in memory: for tests and the replay demo, which run without Postgres.

import type { Outcome, Policy } from "@hoax/core";
import type {
  AccountRow,
  AccountStatus,
  ActionRow,
  AlertRow,
  CounterfactualRow,
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
  drips: Array<{ hoaxKey: string; amount: bigint; txHash: string; at: Date }> = [];
  rateHits = new Map<string, number[]>();

  async createAccount(a: { id: string; owner: string; manageTokenHash: string; chainId?: number }): Promise<AccountRow> {
    const row: AccountRow = {
      id: a.id,
      owner: a.owner.toLowerCase(),
      chainId: a.chainId ?? 50383,
      hoaxKey: null,
      status: "pending_key",
      manageTokenHash: a.manageTokenHash,
      builderApproval1k: 0n,
      paused: false,
      linkedAt: null,
      createdAt: new Date(),
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
    return [...latest.values()];
  }

  async pruneHealthTicks(olderThan: Date) {
    const before = this.ticks.length;
    this.ticks = this.ticks.filter((t) => t.createdAt >= olderThan);
    return before - this.ticks.length;
  }

  async insertAction(a: NewAction) {
    const row: ActionRow = { ...a, owner: a.owner.toLowerCase(), createdAt: new Date() };
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

  async listActions(opts: { owner?: string; limit: number }) {
    return [...this.actions.values()]
      .filter((a) => !opts.owner || a.owner === opts.owner.toLowerCase())
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
      .slice(0, opts.limit)
      .map((a) => ({ ...a }));
  }

  async listPendingActions(chainId?: number) {
    return [...this.actions.values()]
      .filter((a) => a.outcome === "pending" && (chainId === undefined || this.accounts.get(a.accountId)?.chainId === chainId))
      .map((a) => ({ ...a }));
  }

  async liquidatedAfter(accountId: string, pool: string, after: Date) {
    for (const a of this.actions.values()) {
      if (a.accountId === accountId && a.pool.toLowerCase() === pool.toLowerCase() && a.outcome === "missed" && a.createdAt > after) return true;
    }
    return false;
  }

  async rateHit(bucket: string, windowMs: number) {
    const now = Date.now();
    const hits = (this.rateHits.get(bucket) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    this.rateHits.set(bucket, hits);
    return hits.length;
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

  async lastActionAt(accountId: string, market: string) {
    let last: Date | null = null;
    for (const a of this.actions.values()) {
      if (a.accountId === accountId && a.market === market && a.txHash && (!last || a.createdAt > last)) last = a.createdAt;
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

  async insertAlert(a: { accountId: string; kind: string; message: string }) {
    this.alerts.push({ id: this.alerts.length + 1, ...a, createdAt: new Date(), seen: false });
  }

  async listAlerts(accountId: string, limit: number) {
    return this.alerts
      .filter((a) => a.accountId === accountId)
      .sort((x, y) => y.id - x.id)
      .slice(0, limit);
  }

  async recordDrip(hoaxKey: string, amount: bigint, txHash: string) {
    this.drips.push({ hoaxKey: hoaxKey.toLowerCase(), amount, txHash, at: new Date() });
  }

  async dripsSince(since: Date, hoaxKey?: string) {
    return this.drips
      .filter((d) => d.at >= since && (!hoaxKey || d.hoaxKey === hoaxKey.toLowerCase()))
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
      actionsTaken: actions.filter((a) => a.txHash).length,
      saves: actions.filter((a) => a.outcome === "saved").length,
      savedEquity,
      insuranceCost: actions.filter((a) => a.outcome === "not-needed").reduce((s, a) => s + (a.cost ?? 0n), 0n),
      misses: actions.filter((a) => a.outcome === "missed").length,
      conflicts: actions.filter((a) => a.outcome === "conflict").length,
      pending: actions.filter((a) => a.outcome === "pending").length,
    };
  }

  private beats = new Map<string, HeartbeatRow>();

  async beat(service: string, info: Record<string, unknown>) {
    this.beats.set(service, { service, info: { ...info }, beatAt: new Date() });
  }

  async lastBeat(service: string) {
    const b = this.beats.get(service);
    return b ? { ...b, info: { ...b.info } } : null;
  }

  async close() {}
}
