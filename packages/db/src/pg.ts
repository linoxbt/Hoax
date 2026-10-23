import type { Outcome, Policy } from "@hoax/core";
import pg from "pg";
import { pgConfig } from "./connection.ts";
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

type Row = Record<string, unknown>;

const big = (v: unknown): bigint => BigInt(String(v));
const bigOrNull = (v: unknown): bigint | null => (v === null || v === undefined ? null : BigInt(String(v)));
const str = (v: bigint | null): string | null => (v === null ? null : v.toString());
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/** Postgres has no Infinity for our purposes: a flat account stores NULL. */
const finite = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : v);

function toAccount(r: Row): AccountRow {
  return {
    id: String(r.id),
    owner: String(r.owner),
    chainId: Number(r.chain_id ?? 50383),
    hoaxKey: (r.hoax_key as string | null) ?? null,
    status: r.status as AccountStatus,
    manageTokenHash: String(r.manage_token_hash),
    builderApproval1k: big(r.builder_approval_1k),
    paused: Boolean(r.paused),
    linkedAt: (r.linked_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
  };
}

function toPolicy(r: Row): PolicyRow {
  return {
    accountId: String(r.account_id),
    market: String(r.market),
    triggerHealth: Number(r.trigger_health),
    targetHealth: Number(r.target_health),
    maxClosePct: Number(r.max_close_pct),
    maxSlippageBps: Number(r.max_slippage_bps),
    cooldownSec: Number(r.cooldown_s),
    floorSize: bigOrNull(r.floor_size),
    lambda: Number(r.lambda),
    triggerMargin: Number(r.trigger_margin),
    allowFullClose: Boolean(r.allow_full_close),
    enabled: Boolean(r.enabled),
    updatedAt: r.updated_at as Date,
  };
}

function toTick(r: Row): HealthTickRow {
  return {
    accountId: String(r.account_id),
    market: String(r.market),
    block: big(r.block),
    health: num(r.health),
    equity: big(r.equity),
    mmReq: big(r.mm_req),
    mark: big(r.mark),
    markOk: Boolean(r.mark_ok),
    size: big(r.size),
    liqPrice: bigOrNull(r.liq_price),
    createdAt: r.created_at as Date,
  };
}

function toAction(r: Row): ActionRow {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    owner: String(r.owner),
    market: String(r.market),
    pool: String(r.pool),
    side: r.side as ActionRow["side"],
    block: bigOrNull(r.block),
    txHash: (r.tx_hash as string | null) ?? null,
    sizeBefore: big(r.size_before),
    sizeRequested: big(r.size_requested),
    sizeFilled: big(r.size_filled),
    sizeAfter: bigOrNull(r.size_after),
    avgPrice: bigOrNull(r.avg_price),
    mark: big(r.mark),
    cost: bigOrNull(r.cost),
    estCloseCost: bigOrNull(r.est_close_cost),
    estLiqCost: bigOrNull(r.est_liq_cost),
    forcedSlippage: bigOrNull(r.forced_slippage),
    equityBefore: big(r.equity_before),
    mmReqBefore: big(r.mm_req_before),
    healthBefore: Number(r.health_before),
    healthAfter: num(r.health_after),
    liqPriceBefore: bigOrNull(r.liq_price_before),
    liqPriceAfter: bigOrNull(r.liq_price_after),
    builderFee1k: big(r.builder_fee_1k),
    outcome: r.outcome as Outcome,
    reason: (r.reason as string | null) ?? null,
    receipt: r.receipt as ActionRow["receipt"],
    receiptHash: String(r.receipt_hash),
    signature: (r.signature as string | null) ?? null,
    createdAt: r.created_at as Date,
  };
}

function toCounterfactual(r: Row): CounterfactualRow {
  return {
    actionId: String(r.action_id),
    originalLiqPrice: bigOrNull(r.original_liq_price),
    reachedAtBlock: bigOrNull(r.reached_at_block),
    equityAtReach: bigOrNull(r.equity_at_reach),
    equityIfLiquidated: bigOrNull(r.equity_if_liquidated),
    preserved: bigOrNull(r.preserved),
    finalOutcome: r.final_outcome as Outcome,
    resolvedAt: (r.resolved_at as Date | null) ?? null,
  };
}

export class PgStore implements Store {
  readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ ...pgConfig(connectionString), max: 10 });
  }

  private async q(sql: string, params: unknown[] = []): Promise<Row[]> {
    return (await this.pool.query(sql, params)).rows as Row[];
  }

  async createAccount(a: { id: string; owner: string; manageTokenHash: string; chainId?: number }) {
    const [r] = await this.q(
      `INSERT INTO accounts (id, owner, status, manage_token_hash, chain_id) VALUES ($1, $2, 'pending_key', $3, $4) RETURNING *`,
      [a.id, a.owner.toLowerCase(), a.manageTokenHash, a.chainId ?? 50383],
    );
    return toAccount(r);
  }

  async getAccount(id: string) {
    const [r] = await this.q(`SELECT * FROM accounts WHERE id = $1`, [id]);
    return r ? toAccount(r) : null;
  }

  async getAccountByOwner(owner: string, chainId = 50383) {
    const [r] = await this.q(
      `SELECT * FROM accounts WHERE owner = $1 AND chain_id = $2 ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1`,
      [owner.toLowerCase(), chainId],
    );
    return r ? toAccount(r) : null;
  }

  async listAccounts(status: AccountStatus, chainId?: number) {
    const rows =
      chainId === undefined
        ? await this.q(`SELECT * FROM accounts WHERE status = $1 ORDER BY created_at`, [status])
        : await this.q(`SELECT * FROM accounts WHERE status = $1 AND chain_id = $2 ORDER BY created_at`, [status, chainId]);
    return rows.map(toAccount);
  }

  async setHoaxKey(id: string, hoaxKey: string) {
    await this.q(`UPDATE accounts SET hoax_key = $2, status = 'pending_link' WHERE id = $1`, [id, hoaxKey.toLowerCase()]);
  }

  async setStatus(id: string, status: AccountStatus) {
    await this.q(
      `UPDATE accounts SET status = $2, linked_at = CASE WHEN $2 = 'active' THEN now() ELSE linked_at END WHERE id = $1`,
      [id, status],
    );
  }

  async setPaused(id: string, paused: boolean) {
    await this.q(`UPDATE accounts SET paused = $2 WHERE id = $1`, [id, paused]);
  }

  async setBuilderApproval(id: string, approval1k: bigint) {
    await this.q(`UPDATE accounts SET builder_approval_1k = $2 WHERE id = $1`, [id, approval1k.toString()]);
  }

  async upsertPolicy(accountId: string, market: string, p: Policy) {
    const [r] = await this.q(
      `INSERT INTO policies (account_id, market, trigger_health, target_health, max_close_pct, max_slippage_bps,
         cooldown_s, floor_size, lambda, trigger_margin, allow_full_close, enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (account_id, market) DO UPDATE SET
         trigger_health = EXCLUDED.trigger_health, target_health = EXCLUDED.target_health,
         max_close_pct = EXCLUDED.max_close_pct, max_slippage_bps = EXCLUDED.max_slippage_bps,
         cooldown_s = EXCLUDED.cooldown_s, floor_size = EXCLUDED.floor_size, lambda = EXCLUDED.lambda,
         trigger_margin = EXCLUDED.trigger_margin, allow_full_close = EXCLUDED.allow_full_close,
         enabled = EXCLUDED.enabled, updated_at = now()
       RETURNING *`,
      [
        accountId,
        market,
        p.triggerHealth,
        p.targetHealth,
        p.maxClosePct,
        p.maxSlippageBps,
        p.cooldownSec,
        str(p.floorSize),
        p.lambda,
        p.triggerMargin,
        p.allowFullClose,
        p.enabled,
      ],
    );
    return toPolicy(r);
  }

  async listPolicies(accountId: string) {
    return (await this.q(`SELECT * FROM policies WHERE account_id = $1 ORDER BY market`, [accountId])).map(toPolicy);
  }

  async insertHealthTicks(rows: Omit<HealthTickRow, "createdAt">[]) {
    if (rows.length === 0) return;
    const values: unknown[] = [];
    const tuples = rows.map((r, i) => {
      values.push(
        r.accountId,
        r.market,
        r.block.toString(),
        finite(r.health),
        r.equity.toString(),
        r.mmReq.toString(),
        r.mark.toString(),
        r.markOk,
        r.size.toString(),
        str(r.liqPrice),
      );
      const b = i * 10;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
    });
    await this.q(
      `INSERT INTO health_ticks (account_id, market, block, health, equity, mm_req, mark, mark_ok, size, liq_price)
       VALUES ${tuples.join(",")}`,
      values,
    );
  }

  async latestHealth(accountId: string) {
    return (
      await this.q(
        `SELECT DISTINCT ON (market) * FROM health_ticks WHERE account_id = $1 ORDER BY market, created_at DESC, id DESC`,
        [accountId],
      )
    ).map(toTick);
  }

  async pruneHealthTicks(olderThan: Date) {
    const res = await this.pool.query(`DELETE FROM health_ticks WHERE created_at < $1`, [olderThan]);
    return res.rowCount ?? 0;
  }

  async insertAction(a: NewAction) {
    const [r] = await this.q(
      `INSERT INTO actions (id, account_id, owner, market, pool, side, block, tx_hash, size_before, size_requested,
         size_filled, size_after, avg_price, mark, cost, est_close_cost, est_liq_cost, forced_slippage, equity_before,
         mm_req_before, health_before, health_after, liq_price_before, liq_price_after, builder_fee_1k, outcome, reason,
         receipt, receipt_hash, signature)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
       RETURNING *`,
      [
        a.id,
        a.accountId,
        a.owner.toLowerCase(),
        a.market,
        a.pool,
        a.side,
        str(a.block),
        a.txHash,
        a.sizeBefore.toString(),
        a.sizeRequested.toString(),
        a.sizeFilled.toString(),
        str(a.sizeAfter),
        str(a.avgPrice),
        a.mark.toString(),
        str(a.cost),
        str(a.estCloseCost),
        str(a.estLiqCost),
        str(a.forcedSlippage),
        a.equityBefore.toString(),
        a.mmReqBefore.toString(),
        finite(a.healthBefore) ?? 0,
        finite(a.healthAfter),
        str(a.liqPriceBefore),
        str(a.liqPriceAfter),
        a.builderFee1k.toString(),
        a.outcome,
        a.reason,
        JSON.stringify(a.receipt),
        a.receiptHash,
        a.signature,
      ],
    );
    return toAction(r);
  }

  async updateActionOutcome(id: string, outcome: Outcome, reason?: string | null) {
    if (reason === undefined) await this.q(`UPDATE actions SET outcome = $2 WHERE id = $1`, [id, outcome]);
    else await this.q(`UPDATE actions SET outcome = $2, reason = $3 WHERE id = $1`, [id, outcome, reason]);
  }

  async getAction(id: string) {
    const [r] = await this.q(`SELECT * FROM actions WHERE id = $1`, [id]);
    return r ? toAction(r) : null;
  }

  async listActions(opts: { owner?: string; limit: number }) {
    const rows = opts.owner
      ? await this.q(`SELECT * FROM actions WHERE owner = $1 ORDER BY created_at DESC LIMIT $2`, [
          opts.owner.toLowerCase(),
          opts.limit,
        ])
      : await this.q(`SELECT * FROM actions ORDER BY created_at DESC LIMIT $1`, [opts.limit]);
    return rows.map(toAction);
  }

  async listPendingActions(chainId?: number) {
    const rows =
      chainId === undefined
        ? await this.q(`SELECT * FROM actions WHERE outcome = 'pending' ORDER BY created_at`)
        : await this.q(
            `SELECT a.* FROM actions a JOIN accounts c ON c.id = a.account_id
             WHERE a.outcome = 'pending' AND c.chain_id = $1 ORDER BY a.created_at`,
            [chainId],
          );
    return rows.map(toAction);
  }

  async liquidatedAfter(accountId: string, pool: string, after: Date) {
    const [r] = await this.q(
      `SELECT EXISTS (
         SELECT 1 FROM actions
         WHERE account_id = $1 AND lower(pool) = lower($2) AND outcome = 'missed' AND created_at > $3
       ) AS hit`,
      [accountId, pool, after],
    );
    return r?.hit === true;
  }

  async lastActionAt(accountId: string, market: string) {
    const [r] = await this.q(
      `SELECT max(created_at) AS at FROM actions WHERE account_id = $1 AND market = $2 AND tx_hash IS NOT NULL`,
      [accountId, market],
    );
    return (r?.at as Date | null) ?? null;
  }

  async upsertCounterfactual(c: CounterfactualRow) {
    await this.q(
      `INSERT INTO counterfactuals (action_id, original_liq_price, reached_at_block, equity_at_reach,
         equity_if_liquidated, preserved, final_outcome, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (action_id) DO UPDATE SET
         original_liq_price = EXCLUDED.original_liq_price, reached_at_block = EXCLUDED.reached_at_block,
         equity_at_reach = EXCLUDED.equity_at_reach, equity_if_liquidated = EXCLUDED.equity_if_liquidated,
         preserved = EXCLUDED.preserved, final_outcome = EXCLUDED.final_outcome, resolved_at = EXCLUDED.resolved_at`,
      [
        c.actionId,
        str(c.originalLiqPrice),
        str(c.reachedAtBlock),
        str(c.equityAtReach),
        str(c.equityIfLiquidated),
        str(c.preserved),
        c.finalOutcome,
        c.resolvedAt,
      ],
    );
  }

  async getCounterfactual(actionId: string) {
    const [r] = await this.q(`SELECT * FROM counterfactuals WHERE action_id = $1`, [actionId]);
    return r ? toCounterfactual(r) : null;
  }

  async insertAlert(a: { accountId: string; kind: string; message: string }) {
    await this.q(`INSERT INTO alerts (account_id, kind, message) VALUES ($1, $2, $3)`, [a.accountId, a.kind, a.message]);
  }

  async listAlerts(accountId: string, limit: number): Promise<AlertRow[]> {
    return (
      await this.q(`SELECT * FROM alerts WHERE account_id = $1 ORDER BY id DESC LIMIT $2`, [accountId, limit])
    ).map((r) => ({
      id: Number(r.id),
      accountId: String(r.account_id),
      kind: String(r.kind),
      message: String(r.message),
      createdAt: r.created_at as Date,
      seen: Boolean(r.seen),
    }));
  }

  async recordDrip(hoaxKey: string, amount: bigint, txHash: string) {
    await this.q(`INSERT INTO gas_drips (hoax_key, amount, tx_hash) VALUES ($1, $2, $3)`, [
      hoaxKey.toLowerCase(),
      amount.toString(),
      txHash,
    ]);
  }

  async dripsSince(since: Date, hoaxKey?: string) {
    const [r] = hoaxKey
      ? await this.q(`SELECT coalesce(sum(amount), 0) AS s FROM gas_drips WHERE created_at >= $1 AND hoax_key = $2`, [
          since,
          hoaxKey.toLowerCase(),
        ])
      : await this.q(`SELECT coalesce(sum(amount), 0) AS s FROM gas_drips WHERE created_at >= $1`, [since]);
    return big(r.s);
  }

  async stats(): Promise<Stats> {
    const [r] = await this.q(`
      SELECT
        (SELECT count(*) FROM accounts WHERE status = 'active' AND NOT paused) AS accounts,
        (SELECT count(*) FROM actions WHERE tx_hash IS NOT NULL) AS taken,
        (SELECT count(*) FROM actions WHERE outcome = 'saved') AS saves,
        (SELECT coalesce(sum(c.preserved), 0) FROM actions a JOIN counterfactuals c ON c.action_id = a.id
           WHERE a.outcome = 'saved') AS saved_equity,
        (SELECT coalesce(sum(cost), 0) FROM actions WHERE outcome = 'not-needed') AS insurance,
        (SELECT count(*) FROM actions WHERE outcome = 'missed') AS misses,
        (SELECT count(*) FROM actions WHERE outcome = 'conflict') AS conflicts,
        (SELECT count(*) FROM actions WHERE outcome = 'pending') AS pending`);
    return {
      accountsProtected: Number(r.accounts),
      actionsTaken: Number(r.taken),
      saves: Number(r.saves),
      savedEquity: big(r.saved_equity),
      insuranceCost: big(r.insurance),
      misses: Number(r.misses),
      conflicts: Number(r.conflicts),
      pending: Number(r.pending),
    };
  }

  async rateHit(bucket: string, windowMs: number) {
    // The window is measured on the database's clock, the one that stamps the rows.
    await this.q(`INSERT INTO rate_hits (bucket) VALUES ($1)`, [bucket]);
    const [r] = await this.q(
      `SELECT count(*)::int AS n FROM rate_hits WHERE bucket = $1 AND at >= now() - make_interval(secs => $2::double precision / 1000)`,
      [bucket, windowMs],
    );
    return Number(r?.n ?? 0);
  }

  async pruneRateHits(olderThan: Date) {
    const res = await this.pool.query(`DELETE FROM rate_hits WHERE at < $1`, [olderThan]);
    return res.rowCount ?? 0;
  }

  async beat(service: string, info: Record<string, unknown>) {
    await this.pool.query(
      `INSERT INTO heartbeats (service, info, beat_at) VALUES ($1, $2, now())
       ON CONFLICT (service) DO UPDATE SET info = EXCLUDED.info, beat_at = EXCLUDED.beat_at`,
      [service, JSON.stringify(info)],
    );
  }

  async lastBeat(service: string) {
    const { rows } = await this.pool.query(`SELECT service, info, beat_at FROM heartbeats WHERE service = $1`, [service]);
    const r = rows[0];
    const row: HeartbeatRow | null = r ? { service: String(r.service), info: r.info as Record<string, unknown>, beatAt: r.beat_at as Date } : null;
    return row;
  }

  async close() {
    await this.pool.end();
  }
}
