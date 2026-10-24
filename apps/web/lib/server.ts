// Server-only singletons and helpers for the API routes.
import "server-only";
import { DreamDexVenue, HIDEKI, NETWORKS, isNetworkId, networkOf, type MarketInfo, type Venue } from "@hoax/chain";
import { MemoryStore, PgStore, type AccountRow, type Store } from "@hoax/db";
import { bearer, controls, isProduction, parseSession, type Session } from "./auth";
import { DEMO_OWNER, DEMO_TOKEN, seedDemo } from "./demo";

const g = globalThis as unknown as { __hoaxStore?: Store; __hoaxVenues?: Map<number, Venue>; __hoaxSeeded?: Promise<void> };

/**
 * Demo mode: no database and no watcher, so the receipts, stats and the sample
 * account are illustrative. Chain reads (markets, a connected wallet's
 * positions) stay live either way.
 */
export const DEMO = process.env.HOAX_DEMO === "1";

export async function getStore(): Promise<Store> {
  if (!g.__hoaxStore) {
    const url = process.env.DATABASE_URL;
    if (url) {
      checkDatabaseTls(url);
      g.__hoaxStore = new PgStore(url);
    } else if (DEMO || !isProduction()) {
      g.__hoaxStore = new MemoryStore();
      if (DEMO) g.__hoaxSeeded = seedDemo(g.__hoaxStore);
    } else {
      // Each serverless instance would get its own empty store: registrations
      // would vanish and the engine would never see them.
      throw new Error("DATABASE_URL must be set on this deployment (or HOAX_DEMO=1 for sample data)");
    }
  }
  if (g.__hoaxSeeded) await g.__hoaxSeeded;
  return g.__hoaxStore;
}

/**
 * The live venue on one network, Hideki unless asked. Null only when
 * HOAX_OFFLINE=1 (no network, e.g. CI). RPC_URL, WS_URL and INDEXER_URL point
 * Hideki somewhere else (a local fork); SHANNON_RPC_URL does the same for Shannon.
 */
export function getVenue(chainId: number = HIDEKI.id): Venue | null {
  if (process.env.HOAX_OFFLINE === "1") return null;
  g.__hoaxVenues ??= new Map();
  let v = g.__hoaxVenues.get(chainId);
  if (!v) {
    const network = networkOf(chainId);
    const env = network.id === HIDEKI.id ? { rpcUrl: process.env.RPC_URL, wsUrl: process.env.WS_URL, indexerUrl: process.env.INDEXER_URL } : { rpcUrl: process.env.SHANNON_RPC_URL };
    v = new DreamDexVenue({ network, rpcUrl: env.rpcUrl || undefined, wsUrl: env.wsUrl || undefined, indexerUrl: env.indexerUrl || undefined });
    g.__hoaxVenues.set(chainId, v);
  }
  return v;
}

const DEMO_MARKETS: MarketInfo[] = [
  {
    symbol: "ETH-PERP",
    baseSymbol: "ETH",
    pool: "0xD6cB1dD58580B84D76068Ac21594219ce03aedDF",
    marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
    baseDecimals: 18,
    tickSize: 10n ** 16n,
    lotSize: 10n ** 14n,
    minQuantity: 4n * 10n ** 15n,
    maintenanceMarginBps: 250,
    takerFeeBpsTimes1k: 0,
  },
];

export async function getMarkets(chainId: number = HIDEKI.id): Promise<MarketInfo[]> {
  const venue = getVenue(chainId);
  return venue ? venue.listMarkets() : chainId === HIDEKI.id ? DEMO_MARKETS : [];
}

/**
 * The Postgres connection must be TLS with the server's certificate pinned
 * (DATABASE_CA_CERT), or sslmode=verify-full, unless the database is local.
 * DATABASE_INSECURE_TLS=1 overrides it, for a database on a private network.
 */
function checkDatabaseTls(url: string): void {
  if (!isProduction() || process.env.DATABASE_CA_CERT?.trim() || process.env.DATABASE_INSECURE_TLS === "1") return;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (["localhost", "127.0.0.1", "::1", ""].includes(u.hostname)) return;
  if (u.searchParams.get("sslmode") === "verify-full") return;
  throw new Error("DATABASE_URL reaches a remote Postgres without a verified TLS connection: set DATABASE_CA_CERT (or sslmode=verify-full)");
}

/**
 * The wallet session on this request, or null: a valid token, not revoked,
 * and (for a smart wallet's session, with `chainId`) issued on that chain.
 */
export async function sessionFor(req: Request, chainId?: number): Promise<Session | null> {
  const session = parseSession(bearer(req), chainId);
  if (!session) return null;
  // Fails closed: when the store cannot say whether the session was revoked, it is not accepted.
  try {
    const store = await getStore();
    for (const key of revocationKeys(session)) {
      const revoked = await store.sessionsRevokedBefore(key);
      if (revoked && session.issuedAt <= revoked.getTime()) return null;
    }
  } catch (err) {
    console.error("session check failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
  return session;
}

/**
 * What a revocation is recorded under. A plain key is the same wallet on every
 * network; a smart wallet's address may belong to someone else on another
 * network, so its sign-out (and the check) is scoped to its own chain.
 */
export function revocationKeys(session: Session): string[] {
  const wallet = session.wallet.toLowerCase();
  return session.chainId === null ? [wallet] : [wallet, `${wallet}@${session.chainId}`];
}

/** The key "sign out everywhere" revokes for this session. */
export function revocationKeyFor(session: Session): string {
  const wallet = session.wallet.toLowerCase();
  return session.chainId === null ? wallet : `${wallet}@${session.chainId}`;
}

/**
 * True when the request may manage this account: a wallet session for a
 * wallet that owns the account's Safe on the account's network. `fresh` asks
 * the chain now instead of the short cache, for every change.
 */
export async function authorized(req: Request, account: AccountRow, opts: { fresh?: boolean } = {}): Promise<boolean> {
  // The demo's sample account (sample data, nothing on chain) is open to the sample session.
  if (DEMO && account.owner === DEMO_OWNER && bearer(req) === DEMO_TOKEN) return true;
  const session = await sessionFor(req, account.chainId);
  if (!session) return false;
  return controls(session.wallet, account.owner, account.chainId, opts);
}

/**
 * The network a request is about: `chain` in the body or the query string,
 * Hideki when absent. Null when it names a network Hoax does not serve.
 */
export function chainOf(req: Request, body?: { chain?: unknown } | null): number | null {
  const raw = body?.chain ?? new URL(req.url).searchParams.get("chain");
  const id = raw === undefined || raw === null || raw === "" ? HIDEKI.id : Number(raw);
  return isNetworkId(id) ? id : null;
}

export const BAD_CHAIN = "chain must be 50312 (Shannon) or 50383 (Hideki)";

/**
 * Whether each network's protection engine has reported in recently. One
 * engine process runs per network and beats as watcher-<network>; a lone
 * "watcher" beat is an older Hideki engine.
 */
export async function engineStatus() {
  const none = { online: false, lastBeatAt: null, ageSec: null, info: null };
  if (DEMO) return { online: false, mode: "demo" as const, lastBeatAt: null, ageSec: null, info: null, networks: Object.fromEntries(NETWORKS.map((n) => [n.id, none])) };
  const store = await getStore();
  const networks: Record<number, { online: boolean; lastBeatAt: string | null; ageSec: number | null; info: Record<string, unknown> | null }> = {};
  for (const n of NETWORKS) {
    const names = n.id === HIDEKI.id ? [`watcher-${n.key}`, "watcher"] : [`watcher-${n.key}`];
    const beats = (await Promise.all(names.map((s) => store.lastBeat(s).catch(() => null)))).filter((b) => b !== null);
    const beat = beats.sort((a, b) => b.beatAt.getTime() - a.beatAt.getTime())[0] ?? null;
    const ageSec = beat ? Math.round((Date.now() - beat.beatAt.getTime()) / 1000) : null;
    networks[n.id] = { online: ageSec !== null && ageSec < 30, lastBeatAt: beat?.beatAt.toISOString() ?? null, ageSec, info: beat?.info ?? null };
  }
  const freshest = Object.values(networks).sort((a, b) => (a.ageSec ?? Infinity) - (b.ageSec ?? Infinity))[0] ?? none;
  return { ...freshest, online: Object.values(networks).some((x) => x.online), mode: "live" as const, networks };
}

export function isAddress(s: string): s is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

/** JSON with bigints as strings and Infinity as null. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  const body = JSON.stringify(data, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "number" && !Number.isFinite(v)) return null;
    return v;
  });
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status });
}

/**
 * The header the host in front of the app sets itself (and overwrites if a
 * client sends it): Netlify's and Vercel's are known, captured at build time
 * (next.config.mjs); HOAX_CLIENT_IP_HEADER names another proxy's.
 */
function trustedIpHeader(): string | null {
  if (process.env.HOAX_CLIENT_IP_HEADER) return process.env.HOAX_CLIENT_IP_HEADER.toLowerCase();
  if (process.env.HOAX_PLATFORM === "netlify") return "x-nf-client-connection-ip";
  if (process.env.HOAX_PLATFORM === "vercel") return "x-real-ip";
  return null;
}

/**
 * The caller's address, for rate limits. Only the platform's own header is
 * trusted; elsewhere the last X-Forwarded-For entry, which the nearest proxy
 * added (the first is whatever the client sent).
 */
let warnedUntrusted = false;
export function clientIp(req: Request): string {
  const h = req.headers;
  const trusted = trustedIpHeader();
  const own = trusted ? h.get(trusted)?.split(",")[0]?.trim() : null;
  if (own) return own;
  if (isProduction()) {
    // No header this deployment can trust: any address would be the client's
    // own claim, so every caller shares one bucket rather than pick their own.
    if (!warnedUntrusted) {
      warnedUntrusted = true;
      console.warn("no trusted client-IP header (set HOAX_CLIENT_IP_HEADER behind your proxy): rate limits are shared by every caller");
    }
    return "untrusted-proxy";
  }
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return forwarded[forwarded.length - 1] ?? "local";
}

/** Log the detail on the server and give the caller a message that leaks nothing (an RPC URL with a key, say). */
export function failure(status: number, message: string, err: unknown): Response {
  console.error(`${message}:`, err instanceof Error ? err.message : String(err));
  return error(status, message);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID.test(s);
}

const hits = new Map<string, number[]>();
function memoryHit(bucket: string, windowMs: number): number {
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(bucket, recent);
  return recent.length;
}

/**
 * Counts a hit on `bucket` and says whether it is over `max` in the window.
 * Counted in the database, because serverless instances share no memory; this
 * instance's memory stands in when the database cannot count (say, before the
 * watcher has applied migration 004).
 */
export async function rateLimited(bucket: string, max: number, windowMs: number): Promise<boolean> {
  let n: number;
  try {
    n = await (await getStore()).rateHit(bucket, windowMs, max);
  } catch {
    n = memoryHit(bucket, windowMs);
  }
  return n > max;
}

/**
 * A limit counted in this instance's memory only: for read routes, where a
 * database write per request would cost more than it protects. Best effort
 * across serverless instances, which is enough to stop a scraper.
 */
export function rateLimitedLocal(bucket: string, max: number, windowMs: number): boolean {
  // Bounded: past 50,000 buckets the oldest tenth goes (Map keeps insertion
  // order), so a flood of addresses cannot grow it forever or reset everyone's.
  if (hits.size > 50_000) {
    let drop = 5_000;
    for (const k of hits.keys()) {
      if (drop-- <= 0) break;
      hits.delete(k);
    }
  }
  return memoryHit(bucket, windowMs) > max;
}

/** Spend a sign-in nonce, in the store (a primary key: a parallel replay loses). Fails closed. */
export async function useNonce(nonce: string, expiresAt: Date): Promise<boolean> {
  return (await getStore()).useNonce(nonce, expiresAt);
}

/** A short shared cache for a public read, so a burst of callers costs one read. */
const cached = new Map<string, { at: number; value: Promise<unknown> }>();
export function cachedFor<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cached.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  cached.set(key, { at: Date.now(), value });
  value.catch(() => cached.delete(key));
  return value;
}

export const BUILDER = {
  address: (process.env.HOAX_BUILDER_ADDRESS || null) as `0x${string}` | null,
  feeBpsTimes1k: Number(process.env.HOAX_BUILDER_FEE_BPS_1K || "0"),
};
