// Sign-in with the wallet. The trader signs a plain-text message (free, no
// transaction); the server checks the signature and hands back a session token
// bound to that wallet. Everything is stateless: the nonce and the token are
// both HMAC'd with HOAX_SESSION_SECRET, so any server instance can verify them.
//
// A session proves control of a wallet key. Managing a dreamDEX account needs
// more: the wallet must own the account's Safe, which `controls` checks on chain.
//
// A session from a plain key works on every network (the key is the same
// everywhere). A smart wallet's signature is checked on one chain, and the same
// address can have other owners on another, so its session is bound to the
// chain it signed on. Each nonce is good for one session; sessions last a day
// and a wallet can end all of its sessions (sign out everywhere).
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DreamDexAccounts, HIDEKI, isNetworkId, networkOf, type Network } from "@hoax/chain";
import { createPublicClient, getAddress, http, type Address, type Hex } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";

const SESSION_TTL_MS = 24 * 60 * 60_000;
/** ERC-6492 wraps a signature from a smart wallet that is not deployed yet; it ends with these 32 bytes. */
const ERC6492_SUFFIX = "6492649264926492649264926492649264926492649264926492649264926492";
/** Ownership checks are cached briefly; a "no" more briefly still, and an RPC failure never. */
const CONTROLS_OK_MS = 60_000;
const CONTROLS_NO_MS = 10_000;
const CONTROLS_MAX = 5_000;
const CHALLENGE_TTL_MS = 10 * 60_000;

const g = globalThis as unknown as { __hoaxSecret?: Buffer; __hoaxAccounts?: Map<number, DreamDexAccounts>; __hoaxControls?: Map<string, { ok: boolean; at: number }> };

/**
 * Whether this deployment must be strict: a production build, unless it is a
 * pure demo (HOAX_DEMO=1 with no database, nothing real to protect). Demo mode
 * left on next to a real database relaxes nothing.
 */
export function isProduction(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return !(process.env.HOAX_DEMO === "1" && !process.env.DATABASE_URL);
}

function secret(): Buffer {
  if (!g.__hoaxSecret) {
    const s = process.env.HOAX_SESSION_SECRET;
    if (s && s.length >= 32) g.__hoaxSecret = Buffer.from(s);
    else if (isProduction()) {
      // Each serverless instance would make its own secret: a challenge from one
      // would fail on the next, and every cold start would sign everyone out.
      throw new Error("HOAX_SESSION_SECRET (32+ characters) must be set on this deployment");
    } else {
      console.warn("HOAX_SESSION_SECRET is not set (32+ chars): sign-ins will not survive a restart");
      g.__hoaxSecret = randomBytes(32);
    }
  }
  return g.__hoaxSecret;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const mac = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");

function sameMac(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Account reads on one network, Hideki unless asked (RPC_URL / SHANNON_RPC_URL override the RPC). */
export function accountsClient(chainId: number = HIDEKI.id): DreamDexAccounts {
  g.__hoaxAccounts ??= new Map();
  let c = g.__hoaxAccounts.get(chainId);
  if (!c) {
    const network = networkOf(chainId);
    c = new DreamDexAccounts(rpcOverride(network), network);
    g.__hoaxAccounts.set(chainId, c);
  }
  return c;
}

function rpcOverride(network: Network): string | undefined {
  return (network.id === HIDEKI.id ? process.env.RPC_URL : process.env.SHANNON_RPC_URL) || undefined;
}

/** A sign-in failure whose message is written for the user (anything else is not shown). */
export class SignInError extends Error {}

const STATEMENT = "Sign in to Hoax. This proves you control this wallet. It is free and sends no transaction.";

/** The nonce's MAC binds the wallet, the network, this site's host and the expiry; the message carries the rest. */
const nonceMac = (raw: string, exp: number, wallet: Address, chainId: number, host: string) =>
  createHmac("sha256", secret()).update(`siwe.${raw}.${exp}.${wallet.toLowerCase()}.${chainId}.${host}`).digest("hex").slice(0, 32);

/**
 * The message a wallet signs to sign in: EIP-4361 (Sign-In with Ethereum)
 * exactly, so wallets recognise it and warn when the page asking is not the
 * domain it names. For the network the wallet is on (Hideki unless given): a
 * smart wallet's signature is checked on that chain.
 */
export function challenge(wallet: Address, host: string, chainId: number = HIDEKI.id): { message: string; expiresAt: string } {
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const raw = randomBytes(8).toString("hex");
  const message = createSiweMessage({
    address: getAddress(wallet),
    chainId,
    domain: host,
    uri: `https://${host}`,
    version: "1",
    statement: STATEMENT,
    nonce: `${raw}${nonceMac(raw, exp, wallet, chainId, host)}`,
    issuedAt: new Date(),
    expirationTime: new Date(exp),
  });
  return { message, expiresAt: new Date(exp).toISOString() };
}

export interface Session {
  wallet: Address;
  /** The chain a smart wallet signed on; null for a plain key, valid on every network. */
  chainId: number | null;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Check a signed challenge and return a session token for the wallet that
 * signed it. `useNonce` marks the nonce spent and returns false if it already was.
 */
export async function verify(
  message: string,
  signature: Hex,
  host: string,
  useNonce: (nonce: string, expiresAt: Date) => Promise<boolean>,
): Promise<{ wallet: Address; token: string; expiresAt: string; chainId: number | null }> {
  const m = parseSiweMessage(message);
  if (m.domain !== host || m.uri !== `https://${host}`) throw new SignInError("this sign-in message was made for another site");
  if (!m.address || m.version !== "1" || !m.nonce || !m.chainId || !m.expirationTime || !m.issuedAt || m.statement !== STATEMENT) {
    throw new SignInError("sign-in message was not issued by Hoax");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(m.address)) throw new SignInError("sign-in message was not issued by Hoax");
  const wallet = getAddress(m.address);
  const chainId = m.chainId;
  const exp = m.expirationTime.getTime();
  // Exactly the message Hoax issues, nothing added or reordered.
  const canonical = createSiweMessage({
    address: wallet,
    chainId,
    domain: host,
    uri: `https://${host}`,
    version: "1",
    statement: STATEMENT,
    nonce: m.nonce,
    issuedAt: m.issuedAt,
    expirationTime: m.expirationTime,
  });
  const raw = m.nonce.slice(0, 16);
  if (
    canonical !== message ||
    !isNetworkId(chainId) ||
    m.nonce.length !== 48 ||
    !sameMac(m.nonce.slice(16), nonceMac(raw, exp, wallet, chainId, host))
  ) {
    throw new SignInError("sign-in message was not issued by Hoax");
  }
  if (exp < Date.now()) throw new SignInError("sign-in message expired; try again");

  // verifyMessage covers plain keys, ERC-1271 smart wallets and ERC-6492 undeployed
  // ones; a smart wallet answers on the chain it lives on, the one the message names.
  const network = networkOf(chainId);
  const client = createPublicClient({ chain: network.chain, transport: http(rpcOverride(network) ?? network.rpcUrl) });
  const ok = await client.verifyMessage({ address: wallet, message, signature });
  if (!ok) throw new SignInError("signature does not match the wallet");
  // Spent only once the signature is good, so a bad attempt does not burn a real one.
  if (!(await useNonce(m.nonce, new Date(exp + 60_000)))) throw new SignInError("this sign-in message was already used; sign in again");

  const code = await client.getCode({ address: wallet }).catch(() => undefined);
  const contract = (code !== undefined && code !== "0x") || signature.toLowerCase().endsWith(ERC6492_SUFFIX);
  const now = Date.now();
  const sessionExp = now + SESSION_TTL_MS;
  const payload = b64(JSON.stringify({ w: wallet.toLowerCase(), c: contract ? chainId : null, iat: now, exp: sessionExp }));
  return { wallet, token: `hx2.${payload}.${mac(payload)}`, expiresAt: new Date(sessionExp).toISOString(), chainId: contract ? chainId : null };
}

/**
 * The session a token carries, or null when it is not one, has expired, or
 * (with `chainId`) is a smart wallet's session from another chain. Revocation
 * is checked separately, against the store (see server.ts `sessionFor`).
 */
export function parseSession(token: string, chainId?: number): Session | null {
  // hx1 tokens (no chain binding, a week long) are no longer accepted: sign in again.
  if (!token.startsWith("hx2.")) return null;
  const [, payload, sig] = token.split(".");
  if (!payload || !sig || !sameMac(sig, mac(payload))) return null;
  try {
    const { w, c, iat, exp } = JSON.parse(unb64(payload)) as { w: string; c: number | null; iat: number; exp: number };
    if (typeof exp !== "number" || exp < Date.now() || typeof iat !== "number") return null;
    if (c !== null && typeof c !== "number") return null;
    if (chainId !== undefined && c !== null && c !== chainId) return null;
    return { wallet: getAddress(w), chainId: c, issuedAt: iat, expiresAt: exp };
  } catch {
    return null;
  }
}

export function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/**
 * Whether `wallet` may manage the dreamDEX account `owner` on a network
 * (Hideki unless given). Reads are cached for a minute (a "no" for ten
 * seconds); `fresh` asks the chain now, for changes. An RPC failure throws and
 * is never cached, so a blip cannot lock the owner out.
 */
export async function controls(wallet: Address, owner: string, chainId: number = HIDEKI.id, opts: { fresh?: boolean } = {}): Promise<boolean> {
  if (wallet.toLowerCase() === owner.toLowerCase()) return true;
  g.__hoaxControls ??= new Map();
  const cache = g.__hoaxControls;
  const key = `${chainId}:${wallet.toLowerCase()}:${owner.toLowerCase()}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < (hit.ok ? CONTROLS_OK_MS : CONTROLS_NO_MS)) return hit.ok;
  const ok = await accountsClient(chainId).controls(wallet, getAddress(owner));
  cache.delete(key);
  if (cache.size >= CONTROLS_MAX) cache.delete(cache.keys().next().value!); // oldest first
  cache.set(key, { ok, at: Date.now() });
  return ok;
}

/**
 * The hosts a sign-in message may name: HOAX_SITE_HOSTS (read now and at build
 * time) plus the site URLs Netlify and Vercel set, captured at build time
 * (next.config.mjs).
 */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const part of `${process.env.HOAX_ALLOWED_HOSTS ?? ""},${process.env.HOAX_SITE_HOSTS ?? ""}`.split(",")) {
    const s = part.trim();
    if (!s) continue;
    try {
      hosts.add(new URL(s.includes("://") ? s : `https://${s}`).host.toLowerCase());
    } catch {
      // not a host; ignore it
    }
  }
  return hosts;
}

/**
 * The request's host, as the browser saw it (for binding sign-in messages), or
 * null when it is not one of this site's hosts. The headers are the client's to
 * set, so without the check a phishing site could get messages that name it,
 * which a wallet would show without a domain warning, and trade them for sessions here.
 */
export function requestHost(req: Request): string | null {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host).toLowerCase();
  const allowed = allowedHosts();
  if (allowed.size === 0) {
    // Only local development may sign in under any host. A deployment with no
    // list refuses, rather than issue messages for whatever host a caller names.
    return isProduction() ? null : host;
  }
  return allowed.has(host) ? host : null;
}
