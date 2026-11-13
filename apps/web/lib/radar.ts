// Radar: every liquidation on dreamDEX perps, from the markets indexer, priced with the
// protocol's own parameters. Read-only and public: nothing here needs a wallet or the database.
import "server-only";
import { HIDEKI, SHANNON, networkOf, type MarketInfo } from "@hoax/chain";
import { getMarkets, getVenue } from "./server";

export const RADAR_CHAINS = [HIDEKI.id, SHANNON.id] as const;

export interface RadarLeg {
  symbol: string;
  side: "long" | "short";
  size: number;
  price: number;
  notional: number;
}

export interface RadarLiquidation {
  chainId: number;
  txHash: string;
  account: string;
  time: number;
  legs: RadarLeg[];
  notional: number;
  /** The protocol's liquidation penalty rate applied to the notional. */
  penalty: number;
  /** The protocol's minimum forced-close spread: a floor, the real spread can be wider. */
  spreadFloor: number;
  /** Paid to the keeper that ran the liquidation, as the event reports it. */
  keeperReward: number | null;
  /** Losses beyond the account's equity, when the event reports them. */
  badDebt: number | null;
}

export interface RadarParams {
  penaltyBps: number;
  minSpreadBps: number;
  /** "chain" when read from the LiquidationEngine, "default" when the read failed. */
  source: "chain" | "default";
}

export interface RadarMarket {
  chainId: number;
  symbol: string;
  count: number;
  notional: number;
  /** Notional liquidated per bucket of `series`, oldest first. */
  series: number[];
}

export interface RadarSnapshot {
  generatedAt: number;
  hours: number;
  chains: number[];
  params: Record<number, RadarParams>;
  totals: { count: number; accounts: number; notional: number; penalty: number; spreadFloor: number; keeper: number };
  /** Every market with a liquidation in the window, by notional. */
  markets: RadarMarket[];
  /** Buckets across the window: hourly for a day, six-hourly for a week. Oldest first. */
  series: Array<{ t: number; count: number; notional: number }>;
  bucketSec: number;
  items: RadarLiquidation[];
}

/** A market liquidating faster than its own recent pace. */
export interface RadarSignal {
  chainId: number;
  symbol: string;
  /** Liquidations in the last 24 hours. */
  count: number;
  notional: number;
  /** Its daily average over the last 7 days. */
  baseline: number;
  /** count / baseline. */
  ratio: number;
}

type Row = {
  kind: string;
  account: string | null;
  pool: string | null;
  size: string | null;
  price: string | null;
  keeperReward: string | null;
  deficit: string | null;
  timestamp: string;
  txHash: string;
};

const KINDS = ["PositionLiquidated", "KeeperReward", "BadDebtAbsorbed"];
const FIELDS = "kind account pool size price keeperReward deficit timestamp txHash";
const E18 = 1e18;
// What README and the engine use when the chain read fails: 100 bps penalty, 50 bps minimum spread.
const DEFAULT_PARAMS: RadarParams = { penaltyBps: 100, minSpreadBps: 50, source: "default" };

function indexerUrl(chainId: number): string {
  if (chainId === HIDEKI.id && process.env.INDEXER_URL) return process.env.INDEXER_URL;
  if (chainId === SHANNON.id && process.env.SHANNON_INDEXER_URL) return process.env.SHANNON_INDEXER_URL;
  return networkOf(chainId).indexerUrl;
}

async function gql<T>(chainId: number, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(indexerUrl(chainId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(`indexer: ${body.errors[0].message}`);
  return body.data as T;
}

/** Liquidation events since `since` (unix seconds), newest first, paged up to `max` rows. */
async function events(chainId: number, since: number, max: number): Promise<Row[]> {
  const out: Row[] = [];
  // Ordered by timestamp alone (Shannon's indexer cannot sort by log index), so rows that share a
  // timestamp can repeat across a page boundary: each event is kept once.
  const seen = new Set<string>();
  const page = 1000;
  for (let offset = 0; offset < max; offset += page) {
    const data = await gql<{ LiquidationEvent: Row[] }>(
      chainId,
      `query($since: numeric!, $kinds: [String!], $limit: Int!, $offset: Int!) {
        LiquidationEvent(where: { timestamp: { _gte: $since }, kind: { _in: $kinds } }, order_by: { timestamp: desc }, limit: $limit, offset: $offset) { ${FIELDS} }
      }`,
      { since, kinds: KINDS, limit: Math.min(page, max - offset), offset },
    );
    for (const r of data.LiquidationEvent) {
      const key = `${r.txHash}:${r.kind}:${r.account}:${r.pool}:${r.size}:${r.keeperReward}:${r.deficit}`;
      if (!seen.has(key)) (seen.add(key), out.push(r));
    }
    if (data.LiquidationEvent.length < page) break;
  }
  return out;
}

const g = globalThis as unknown as { __radarCache?: Map<string, { at: number; value: unknown }> };
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  g.__radarCache ??= new Map();
  const hit = g.__radarCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  g.__radarCache.set(key, { at: Date.now(), value });
  return value;
}

async function marketsBy(chainId: number): Promise<Map<string, MarketInfo>> {
  return cached(`markets:${chainId}`, 10 * 60_000, async () => {
    const list = await getMarkets(chainId).catch(() => [] as MarketInfo[]);
    return new Map(list.map((m) => [m.pool.toLowerCase(), m]));
  });
}

async function paramsFor(chainId: number, markets: Map<string, MarketInfo>): Promise<RadarParams> {
  return cached(`params:${chainId}`, 30 * 60_000, async () => {
    const bank = [...markets.values()][0]?.marginBank;
    const venue = getVenue(chainId);
    if (!bank || !venue) return DEFAULT_PARAMS;
    try {
      const p = await venue.liquidationParams(bank);
      return { penaltyBps: p.penaltyBps, minSpreadBps: p.minSpreadBps, source: "chain" };
    } catch {
      return DEFAULT_PARAMS;
    }
  });
}

/**
 * dreamDEX's test pools are left out of every figure: the load-test pools carry no real price, and the
 * numbered test instances (T1C1033, T581A66, ...) mirror real markets with synthetic flow.
 */
const real = (m: MarketInfo | undefined): m is MarketInfo => {
  if (!m) return false;
  const b = m.baseSymbol.toUpperCase();
  return !b.startsWith("LOADTEST") && !/^T\d[0-9A-F]{5}$/.test(b);
};

/** Groups one network's events into liquidations: one per transaction and account. */
function group(chainId: number, rows: Row[], markets: Map<string, MarketInfo>, params: RadarParams): RadarLiquidation[] {
  const by = new Map<string, RadarLiquidation>();
  for (const r of rows) {
    if (!r.account) continue;
    const key = `${r.txHash}:${r.account}`;
    let l = by.get(key);
    if (!l) {
      l = { chainId, txHash: r.txHash, account: r.account, time: Number(r.timestamp), legs: [], notional: 0, penalty: 0, spreadFloor: 0, keeperReward: null, badDebt: null };
      by.set(key, l);
    }
    if (r.kind === "PositionLiquidated" && r.pool && r.size && r.price) {
      const m = markets.get(r.pool.toLowerCase());
      if (!real(m)) continue;
      const size = Math.abs(Number(r.size)) / 10 ** m.baseDecimals;
      const price = Number(r.price) / E18;
      // The engine sells a long to close it, so a negative size delta was a long.
      l.legs.push({ symbol: m.symbol, side: Number(r.size) < 0 ? "long" : "short", size, price, notional: size * price });
    } else if (r.kind === "KeeperReward" && r.keeperReward) {
      l.keeperReward = (l.keeperReward ?? 0) + Number(r.keeperReward) / E18;
    } else if (r.kind === "BadDebtAbsorbed" && r.deficit) {
      l.badDebt = (l.badDebt ?? 0) + Number(r.deficit) / E18;
    }
  }
  const out: RadarLiquidation[] = [];
  for (const l of by.values()) {
    if (!l.legs.length) continue;
    l.notional = l.legs.reduce((s, x) => s + x.notional, 0);
    l.penalty = (l.notional * params.penaltyBps) / 10_000;
    l.spreadFloor = (l.notional * params.minSpreadBps) / 10_000;
    out.push(l);
  }
  return out;
}

/** Every liquidation in the last `hours`, on one network or both, with totals and the busiest markets. */
export async function radarSnapshot(chains: number[], hours: number): Promise<RadarSnapshot> {
  // A week of events is heavier to read and changes slowly: kept a minute.
  return cached(`snap:${chains.join(",")}:${hours}`, hours > 24 ? 60_000 : 10_000, async () => {
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    const params: Record<number, RadarParams> = {};
    const all: RadarLiquidation[] = [];
    await Promise.all(
      chains.map(async (chainId) => {
        const markets = await marketsBy(chainId);
        params[chainId] = await paramsFor(chainId, markets);
        const rows = await events(chainId, since, hours > 24 ? 8000 : 4000);
        all.push(...group(chainId, rows, markets, params[chainId]));
      }),
    );
    all.sort((a, b) => b.time - a.time);
    const bucketSec = hours > 24 ? 6 * 3600 : 3600;
    const n = Math.ceil((hours * 3600) / bucketSec);
    const start = Math.floor(Date.now() / 1000 / bucketSec) * bucketSec - (n - 1) * bucketSec;
    const slot = (t: number) => Math.min(n - 1, Math.max(0, Math.floor((t - start) / bucketSec)));
    const series = Array.from({ length: n }, (_, i) => ({ t: start + i * bucketSec, count: 0, notional: 0 }));
    const bySym = new Map<string, RadarMarket>();
    for (const l of all) {
      const b = series[slot(l.time)];
      b.count++;
      b.notional += l.notional;
      for (const leg of l.legs) {
        const k = `${l.chainId}:${leg.symbol}`;
        const e = bySym.get(k) ?? { chainId: l.chainId, symbol: leg.symbol, count: 0, notional: 0, series: new Array<number>(n).fill(0) };
        e.count++;
        e.notional += leg.notional;
        e.series[slot(l.time)] += leg.notional;
        bySym.set(k, e);
      }
    }
    return {
      generatedAt: Date.now(),
      hours,
      chains,
      params,
      totals: {
        count: all.length,
        accounts: new Set(all.map((l) => `${l.chainId}:${l.account}`)).size,
        notional: all.reduce((s, l) => s + l.notional, 0),
        penalty: all.reduce((s, l) => s + l.penalty, 0),
        spreadFloor: all.reduce((s, l) => s + l.spreadFloor, 0),
        keeper: all.reduce((s, l) => s + (l.keeperReward ?? 0), 0),
      },
      markets: [...bySym.values()].sort((a, b) => b.notional - a.notional),
      series,
      bucketSec,
      items: all.slice(0, 120),
    };
  });
}

/**
 * Markets liquidating faster than their own 7-day pace: the last 24 hours against
 * the 7-day daily average, for markets with at least `min` liquidations today.
 */
export async function radarSignals(chains: number[], min = 3): Promise<{ day: RadarSnapshot; week: RadarSnapshot; signals: RadarSignal[] }> {
  const [day, week] = await Promise.all([radarSnapshot(chains, 24), radarSnapshot(chains, 168)]);
  const weekBy = new Map(week.markets.map((m) => [`${m.chainId}:${m.symbol}`, m]));
  const signals: RadarSignal[] = [];
  for (const m of day.markets) {
    if (m.count < min) continue;
    const w = weekBy.get(`${m.chainId}:${m.symbol}`);
    const baseline = (w?.count ?? m.count) / 7;
    signals.push({ chainId: m.chainId, symbol: m.symbol, count: m.count, notional: m.notional, baseline, ratio: baseline > 0 ? m.count / baseline : 0 });
  }
  signals.sort((a, b) => b.ratio - a.ratio || b.notional - a.notional);
  return { day, week, signals };
}

/** The liquidations in one transaction, for its share page. */
export async function radarTx(chainId: number, txHash: string): Promise<{ items: RadarLiquidation[]; params: RadarParams }> {
  return cached(`tx:${chainId}:${txHash}`, 60_000, async () => {
    const markets = await marketsBy(chainId);
    const params = await paramsFor(chainId, markets);
    const data = await gql<{ LiquidationEvent: Row[] }>(
      chainId,
      `query($tx: String!, $kinds: [String!]) { LiquidationEvent(where: { txHash: { _eq: $tx }, kind: { _in: $kinds } }, order_by: { timestamp: asc }) { ${FIELDS} } }`,
      { tx: txHash.toLowerCase(), kinds: KINDS },
    );
    return { items: group(chainId, data.LiquidationEvent, markets, params), params };
  });
}

export function parseRadarChains(raw: string | null): number[] | null {
  if (!raw || raw === "all") return [...RADAR_CHAINS];
  const id = Number(raw);
  return (RADAR_CHAINS as readonly number[]).includes(id) ? [id] : null;
}
