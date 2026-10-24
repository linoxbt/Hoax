import { createHash } from "node:crypto";
import type { Outcome, Policy, Resolution } from "@hoax/core";
import pg from "pg";
import { pgConfig } from "./connection.ts";
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
    builderApproval1k: big(r.builder_approval_1k),
    paused: Boolean(r.paused),
    linkedAt: (r.linked_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
    liqScanFrom: bigOrNull(r.liq_scan_from),
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
    txNonce: r.tx_nonce === null || r.tx_nonce === undefined ? null : Number(r.tx_nonce),
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
    healthBefore: r.health_before === null || r.health_before === undefined ? Number.POSITIVE_INFINITY : Number(r.health_before),
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
    resolution: (r.resolution as Resolution | null) ?? null,
    resolutionHash: (r.resolution_hash as string | null) ?? null,
    resolutionSignature: (r.resolution_signature as string | null) ?? null,
  };
}

/** A lease name as a 64-bit advisory lock key. */
function leaseKey(name: string): string {
  return BigInt.asIntN(64, BigInt("0x" + createHash("sha256").update(`hoax-lease:${name}`).digest("hex").slice(0, 16))).toString();
}

export class PgStore implements Store {
  readonly pool: pg.Pool;
  private leaseClient: pg.PoolClient | null = null;
  private leaseProbe: NodeJS.Timeout | null = null;

  constructor(connectionString: string) {
    // keepAlive: a connection that silently dies (a NAT dropping it) is noticed, the lease's included.
    this.pool = new pg.Pool({ ...pgConfig(connectionString), max: 10, keepAlive: true });
  }

  private async q(sql: string, params: unknown[] = []): Promise<Row[]> {
    return (await this.pool.query(sql, params)).rows as Row[];
  }

  async createAccount(a: { id: string; owner: string; chainId?: number }) {
    const owner = a.owner.toLowerCase();
    const chainId = a.chainId ?? 50383;
    const [r] = await this.q(
      `INSERT INTO accounts (id, owner, status, chain_id) VALUES ($1, $2, 'pending_key', $3)
       ON CONFLICT (owner, chain_id) WHERE status IN ('pending_key', 'pending_link') DO NOTHING
       RETURNING *`,
      [a.id, owner, chainId],
    );
    if (r) return toAccount(r);
    const [existing] = await this.q(
      `SELECT * FROM accounts WHERE owner = $1 AND chain_id = $2 AND status IN ('pending_key', 'pending_link') LIMIT 1`,
      [owner, chainId],
    );
    if (!existing) throw new Error("registration conflict: try again");
    return toAccount(existing);
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

  async setLiqScanFrom(id: string, block: bigint) {
    await this.q(`UPDATE accounts SET liq_scan_from = $2 WHERE id = $1`, [id, block.toString()]);
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
         receipt, receipt_hash, signature, tx_nonce)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
       ON CONFLICT (id) DO UPDATE SET
         block = EXCLUDED.block, tx_hash = EXCLUDED.tx_hash, size_before = EXCLUDED.size_before,
         size_requested = EXCLUDED.size_requested, size_filled = EXCLUDED.size_filled, size_after = EXCLUDED.size_after,
         avg_price = EXCLUDED.avg_price, mark = EXCLUDED.mark, cost = EXCLUDED.cost, est_close_cost = EXCLUDED.est_close_cost,
         est_liq_cost = EXCLUDED.est_liq_cost, forced_slippage = EXCLUDED.forced_slippage, equity_before = EXCLUDED.equity_before,
         mm_req_before = EXCLUDED.mm_req_before, health_before = EXCLUDED.health_before, health_after = EXCLUDED.health_after,
         liq_price_before = EXCLUDED.liq_price_before, liq_price_after = EXCLUDED.liq_price_after,
         builder_fee_1k = EXCLUDED.builder_fee_1k, outcome = EXCLUDED.outcome, reason = EXCLUDED.reason,
         receipt = EXCLUDED.receipt, receipt_hash = EXCLUDED.receipt_hash, signature = EXCLUDED.signature,
         tx_nonce = EXCLUDED.tx_nonce
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
        finite(a.healthBefore),
        finite(a.healthAfter),
        str(a.liqPriceBefore),
        str(a.liqPriceAfter),
        a.builderFee1k.toString(),
        a.outcome,
        a.reason,
        JSON.stringify(a.receipt),
        a.receiptHash,
        a.signature,
        a.txNonce,
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

  async listActions(opts: { owner?: string; chainId?: number; limit: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.owner) {
      params.push(opts.owner.toLowerCase());
      where.push(`a.owner = $${params.length}`);
    }
    if (opts.chainId !== undefined) {
      params.push(opts.chainId);
      where.push(`c.chain_id = $${params.length}`);
    }
    params.push(Math.max(1, Math.min(500, Math.floor(opts.limit))));
    const rows = await this.q(
      `SELECT a.* FROM actions a JOIN accounts c ON c.id = a.account_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY a.created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(toAction);
  }

  async listUnconfirmedActions(accountId: string) {
    return (
      await this.q(`SELECT * FROM actions WHERE account_id = $1 AND outcome = 'unconfirmed' ORDER BY created_at`, [accountId])
    ).map(toAction);
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

  async recordLiquidations(rows: Array<{ accountId: string; pool: string; block: bigint; txHash: string; sizeDelta: bigint }>) {
    if (rows.length === 0) return;
    const values: unknown[] = [];
    const tuples = rows.map((r, i) => {
      values.push(r.accountId, r.pool.toLowerCase(), r.block.toString(), r.txHash, r.sizeDelta.toString());
      const b = i * 5;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await this.q(
      `INSERT INTO liquidations (account_id, pool, block, tx_hash, size_delta) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`,
      values,
    );
  }

  async liquidatedAfter(accountId: string, pool: string, afterBlock: bigint) {
    const [r] = await this.q(
      `SELECT EXISTS (SELECT 1 FROM liquidations WHERE account_id = $1 AND pool = lower($2) AND block >= $3) AS hit`,
      [accountId, pool, afterBlock.toString()],
    );
    return r?.hit === true;
  }

  async listUnconfirmedForOwner(owner: string, chainId: number) {
    return (
      await this.q(
        `SELECT a.* FROM actions a JOIN accounts c ON c.id = a.account_id
         WHERE a.owner = $1 AND c.chain_id = $2 AND a.outcome = 'unconfirmed' ORDER BY a.created_at`,
        [owner.toLowerCase(), chainId],
      )
    ).map(toAction);
  }

  async listUnconfirmedOnChain(chainId?: number) {
    const rows =
      chainId === undefined
        ? await this.q(`SELECT * FROM actions WHERE outcome = 'unconfirmed' ORDER BY created_at`)
        : await this.q(
            `SELECT a.* FROM actions a JOIN accounts c ON c.id = a.account_id
             WHERE a.outcome = 'unconfirmed' AND c.chain_id = $1 ORDER BY a.created_at`,
            [chainId],
          );
    return rows.map(toAction);
  }

  async lastMissAt(accountId: string, pool: string) {
    const [r] = await this.q(
      `SELECT max(created_at) AS at FROM actions WHERE account_id = $1 AND lower(pool) = lower($2) AND outcome = 'missed'`,
      [accountId, pool],
    );
    return (r?.at as Date | null) ?? null;
  }

  async lastActionAt(owner: string, chainId: number, market: string) {
    // The receipt's createdAt is the engine's clock, the one the cooldown is measured on.
    const [r] = await this.q(
      `SELECT max((a.receipt->>'createdAt')::timestamptz) AS at FROM actions a JOIN accounts c ON c.id = a.account_id
       WHERE a.owner = $1 AND c.chain_id = $2 AND a.market = $3 AND a.tx_hash IS NOT NULL AND a.outcome NOT IN ('missed', 'skipped')`,
      [owner.toLowerCase(), chainId, market],
    );
    return (r?.at as Date | null) ?? null;
  }

  async upsertCounterfactual(c: CounterfactualRow) {
    await this.q(
      `INSERT INTO counterfactuals (action_id, original_liq_price, reached_at_block, equity_at_reach,
         equity_if_liquidated, preserved, final_outcome, resolved_at, resolution, resolution_hash, resolution_signature)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (action_id) DO UPDATE SET
         original_liq_price = EXCLUDED.original_liq_price, reached_at_block = EXCLUDED.reached_at_block,
         equity_at_reach = EXCLUDED.equity_at_reach, equity_if_liquidated = EXCLUDED.equity_if_liquidated,
         preserved = EXCLUDED.preserved, final_outcome = EXCLUDED.final_outcome, resolved_at = EXCLUDED.resolved_at,
         resolution = EXCLUDED.resolution, resolution_hash = EXCLUDED.resolution_hash,
         resolution_signature = EXCLUDED.resolution_signature`,
      [
        c.actionId,
        str(c.originalLiqPrice),
        str(c.reachedAtBlock),
        str(c.equityAtReach),
        str(c.equityIfLiquidated),
        str(c.preserved),
        c.finalOutcome,
        c.resolvedAt,
        c.resolution ? JSON.stringify(c.resolution) : null,
        c.resolutionHash,
        c.resolutionSignature,
      ],
    );
  }

  async getCounterfactual(actionId: string) {
    const [r] = await this.q(`SELECT * FROM counterfactuals WHERE action_id = $1`, [actionId]);
    return r ? toCounterfactual(r) : null;
  }

  async getCounterfactuals(actionIds: string[]) {
    const out = new Map<string, ReturnType<typeof toCounterfactual>>();
    if (actionIds.length === 0) return out;
    for (const r of await this.q(`SELECT * FROM counterfactuals WHERE action_id = ANY($1::uuid[])`, [actionIds])) {
      const c = toCounterfactual(r);
      out.set(c.actionId, c);
    }
    return out;
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

  async reserveDrip(r: {
    hoaxKey: string;
    chainId: number | null;
    amount: bigint;
    perKeyCap: bigint;
    dailyCap: bigint;
    windowMs: number;
    minGapMs: number;
  }): Promise<DripReservation> {
    const key = r.hoaxKey.toLowerCase();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // One reservation at a time per network, across every engine process.
      await client.query("SELECT pg_advisory_xact_lock($1)", [leaseKey(`gas:${r.chainId ?? "any"}`)]);
      const window = `now() - make_interval(secs => $2::double precision / 1000)`;
      const { rows } = await client.query(
        `SELECT
           coalesce(sum(amount) FILTER (WHERE hoax_key = $1), 0) AS for_key,
           coalesce(sum(amount) FILTER (WHERE chain_id IS NOT DISTINCT FROM $3), 0) AS total,
           max(created_at) FILTER (WHERE hoax_key = $1) AS last_at,
           now() AS now
         FROM gas_drips WHERE created_at >= ${window}`,
        [key, r.windowMs, r.chainId],
      );
      const row = rows[0] as Row;
      const lastAt = row.last_at as Date | null;
      const now = row.now as Date;
      let refused: "key-cap" | "daily-cap" | "recent" | null = null;
      if (lastAt && now.getTime() - lastAt.getTime() < r.minGapMs) refused = "recent";
      else if (big(row.for_key) + r.amount > r.perKeyCap) refused = "key-cap";
      else if (big(row.total) + r.amount > r.dailyCap) refused = "daily-cap";
      if (refused) {
        await client.query("ROLLBACK");
        return { ok: false, reason: refused };
      }
      const ins = await client.query(
        `INSERT INTO gas_drips (hoax_key, amount, tx_hash, chain_id, status) VALUES ($1, $2, NULL, $3, 'reserved') RETURNING id`,
        [key, r.amount.toString(), r.chainId],
      );
      await client.query("COMMIT");
      return { ok: true, id: String(ins.rows[0].id) };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async completeDrip(id: string, txHash: string) {
    await this.q(`UPDATE gas_drips SET tx_hash = $2, status = 'sent' WHERE id = $1`, [id, txHash]);
  }

  async cancelDrip(id: string) {
    await this.q(`DELETE FROM gas_drips WHERE id = $1 AND status = 'reserved'`, [id]);
  }

  async dripsSince(since: Date, opts: { hoaxKey?: string; chainId?: number | null } = {}) {
    const where = ["created_at >= $1"];
    const params: unknown[] = [since];
    if (opts.hoaxKey) {
      params.push(opts.hoaxKey.toLowerCase());
      where.push(`hoax_key = $${params.length}`);
    }
    if (opts.chainId !== undefined) {
      params.push(opts.chainId);
      where.push(`chain_id IS NOT DISTINCT FROM $${params.length}`);
    }
    const [r] = await this.q(`SELECT coalesce(sum(amount), 0) AS s FROM gas_drips WHERE ${where.join(" AND ")}`, params);
    return big(r.s);
  }

  async stats(): Promise<Stats> {
    const [r] = await this.q(`
      SELECT
        (SELECT count(*) FROM accounts WHERE status = 'active' AND NOT paused) AS accounts,
        (SELECT count(*) FROM actions WHERE size_filled > 0) AS taken,
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

  async rateHit(bucket: string, windowMs: number, max: number) {
    // The window is measured on the database's clock, the one that stamps the
    // rows. The hit is stored only while the bucket is under its limit, and a
    // lock per bucket makes count-then-insert atomic, so a burst of parallel
    // requests cannot all slip under the limit. Refused requests add no rows.
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [leaseKey(`rate:${bucket}`)]);
      const { rows } = await client.query(
        `WITH c AS (
           SELECT count(*)::int AS n FROM rate_hits
            WHERE bucket = $1 AND at >= now() - make_interval(secs => $2::double precision / 1000)
         ), ins AS (
           INSERT INTO rate_hits (bucket) SELECT $1 FROM c WHERE c.n < $3 RETURNING 1
         )
         SELECT n + 1 AS n FROM c`,
        [bucket, windowMs, max],
      );
      await client.query("COMMIT");
      return Number(rows[0]?.n ?? 0);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async useNonce(nonce: string, expiresAt: Date) {
    const rows = await this.q(`INSERT INTO used_nonces (nonce, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1 AS ok`, [nonce, expiresAt]);
    return rows.length === 1;
  }

  async pruneNonces(now: Date) {
    const res = await this.pool.query(`DELETE FROM used_nonces WHERE expires_at < $1`, [now]);
    return res.rowCount ?? 0;
  }

  async pruneRateHits(olderThan: Date) {
    const res = await this.pool.query(`DELETE FROM rate_hits WHERE at < $1`, [olderThan]);
    return res.rowCount ?? 0;
  }

  async revokeSessions(wallet: string, before: Date) {
    await this.q(
      `INSERT INTO session_revocations (wallet, revoked_before) VALUES ($1, $2)
       ON CONFLICT (wallet) DO UPDATE SET revoked_before = GREATEST(session_revocations.revoked_before, EXCLUDED.revoked_before)`,
      [wallet.toLowerCase(), before],
    );
  }

  async sessionsRevokedBefore(wallet: string) {
    const [r] = await this.q(`SELECT revoked_before FROM session_revocations WHERE wallet = $1`, [wallet.toLowerCase()]);
    return (r?.revoked_before as Date | null) ?? null;
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

  async acquireLease(name: string) {
    if (this.leaseClient) return true;
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [leaseKey(name)]);
      if (rows[0]?.ok === true) {
        // Held by this session for as long as the connection stays checked out.
        this.leaseClient = client;
        client.on("error", () => this.dropLease());
        // An idle connection may die without an error event: ask it every 10 s.
        this.leaseProbe = setInterval(() => {
          client.query("SELECT 1").catch(() => this.dropLease());
        }, 10_000);
        this.leaseProbe.unref();
        return true;
      }
      client.release();
      return false;
    } catch (err) {
      client.release();
      throw err;
    }
  }

  private dropLease(): void {
    if (this.leaseProbe) clearInterval(this.leaseProbe);
    this.leaseProbe = null;
    this.leaseClient = null;
  }

  /** Whether the lease is still held (its connection has not dropped). */
  get leaseHeld(): boolean {
    return this.leaseClient !== null;
  }

  async close() {
    if (this.leaseClient) {
      const c = this.leaseClient;
      this.dropLease();
      c.release();
    }
    await this.pool.end();
  }
}
