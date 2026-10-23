// Server-only singletons and helpers for the API routes.
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DreamDexVenue, type MarketInfo, type Venue } from "@hoax/chain";
import { MemoryStore, PgStore, type AccountRow, type Store } from "@hoax/db";
import { seedDemo } from "./demo";

const g = globalThis as unknown as { __hoaxStore?: Store; __hoaxVenue?: Venue; __hoaxSeeded?: Promise<void> };

export const DEMO = process.env.HOAX_DEMO === "1";

export async function getStore(): Promise<Store> {
  if (!g.__hoaxStore) {
    const url = process.env.DATABASE_URL;
    g.__hoaxStore = url ? new PgStore(url) : new MemoryStore();
    if (!url && DEMO) g.__hoaxSeeded = seedDemo(g.__hoaxStore);
  }
  if (g.__hoaxSeeded) await g.__hoaxSeeded;
  return g.__hoaxStore;
}

/** The live venue, or null in demo mode where nothing touches the chain. */
export function getVenue(): Venue | null {
  if (DEMO) return null;
  if (!g.__hoaxVenue) {
    g.__hoaxVenue = new DreamDexVenue({
      rpcUrl: process.env.RPC_URL || undefined,
      wsUrl: process.env.WS_URL || undefined,
      indexerUrl: process.env.INDEXER_URL || undefined,
    });
  }
  return g.__hoaxVenue;
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

export async function getMarkets(): Promise<MarketInfo[]> {
  const venue = getVenue();
  return venue ? venue.listMarkets() : DEMO_MARKETS;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** True when the request carries the manage token for this account. */
export function authorized(req: Request, account: AccountRow): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(account.manageTokenHash);
  return a.length === b.length && timingSafeEqual(a, b);
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

/** A small per-IP limiter for registrations, so nobody can mint keys in bulk. */
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, max: number, windowMs: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

export const BUILDER = {
  address: (process.env.HOAX_BUILDER_ADDRESS || null) as `0x${string}` | null,
  feeBpsTimes1k: Number(process.env.HOAX_BUILDER_FEE_BPS_1K || "0"),
};
