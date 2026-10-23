// Sign-in with the wallet. The trader signs a plain-text message (free, no
// transaction); the server checks the signature and hands back a session token
// bound to that wallet. Everything is stateless: the nonce and the token are
// both HMAC'd with HOAX_SESSION_SECRET, so any server instance can verify them.
//
// A session proves control of a wallet key. Managing a dreamDEX account needs
// more: the wallet must own the account's Safe, which `controls` checks on chain.
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DreamDexAccounts, HIDEKI } from "@hoax/chain";
import { createPublicClient, getAddress, http, type Address, type Hex } from "viem";

const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const CHALLENGE_TTL_MS = 10 * 60_000;

const g = globalThis as unknown as { __hoaxSecret?: Buffer; __hoaxAccounts?: DreamDexAccounts; __hoaxControls?: Map<string, { ok: boolean; at: number }> };

function secret(): Buffer {
  if (!g.__hoaxSecret) {
    const s = process.env.HOAX_SESSION_SECRET;
    if (s && s.length >= 32) g.__hoaxSecret = Buffer.from(s);
    else {
      // Without a configured secret, sessions live as long as this server instance.
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

export function accountsClient(): DreamDexAccounts {
  g.__hoaxAccounts ??= new DreamDexAccounts(process.env.RPC_URL || undefined);
  return g.__hoaxAccounts;
}

/** The message a wallet signs to sign in. */
export function challenge(wallet: Address, host: string): { message: string; expiresAt: string } {
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const raw = randomBytes(12).toString("base64url");
  const nonce = `${raw}.${exp}.${mac(`${raw}.${exp}.${wallet.toLowerCase()}`)}`;
  const message = [
    `${host} wants you to sign in with your wallet:`,
    getAddress(wallet),
    "",
    "Sign in to Hoax. This proves you control this wallet. It is free and sends no transaction.",
    "",
    `URI: https://${host}`,
    `Chain ID: ${HIDEKI.chain.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
    `Expiration Time: ${new Date(exp).toISOString()}`,
  ].join("\n");
  return { message, expiresAt: new Date(exp).toISOString() };
}

/** Check a signed challenge and return a session token for the wallet that signed it. */
export async function verify(message: string, signature: Hex, host: string): Promise<{ wallet: Address; token: string; expiresAt: string }> {
  const lines = message.split("\n");
  if (lines[0] !== `${host} wants you to sign in with your wallet:`) throw new Error("this sign-in message was made for another site");
  const wallet = getAddress(lines[1] ?? "");
  const nonce = lines.find((l) => l.startsWith("Nonce: "))?.slice(7) ?? "";
  const [raw, expStr, nonceMac] = nonce.split(".");
  const exp = Number(expStr);
  if (!raw || !nonceMac || !sameMac(nonceMac, mac(`${raw}.${expStr}.${wallet.toLowerCase()}`))) throw new Error("sign-in message was not issued by Hoax");
  if (!Number.isFinite(exp) || exp < Date.now()) throw new Error("sign-in message expired; try again");

  // verifyMessage covers plain keys, ERC-1271 smart wallets and ERC-6492 undeployed ones.
  const client = createPublicClient({ chain: HIDEKI.chain, transport: http(process.env.RPC_URL || HIDEKI.rpcUrl) });
  const ok = await client.verifyMessage({ address: wallet, message, signature });
  if (!ok) throw new Error("signature does not match the wallet");

  const sessionExp = Date.now() + SESSION_TTL_MS;
  const payload = b64(JSON.stringify({ w: wallet.toLowerCase(), exp: sessionExp }));
  return { wallet, token: `hx1.${payload}.${mac(payload)}`, expiresAt: new Date(sessionExp).toISOString() };
}

/** The wallet a session token was issued to, or null. */
export function sessionWallet(token: string): Address | null {
  if (!token.startsWith("hx1.")) return null;
  const [, payload, sig] = token.split(".");
  if (!payload || !sig || !sameMac(sig, mac(payload))) return null;
  try {
    const { w, exp } = JSON.parse(unb64(payload)) as { w: string; exp: number };
    if (typeof exp !== "number" || exp < Date.now()) return null;
    return getAddress(w);
  } catch {
    return null;
  }
}

export function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/** Whether `wallet` may manage the dreamDEX account `owner`. Cached for five minutes. */
export async function controls(wallet: Address, owner: string): Promise<boolean> {
  if (wallet.toLowerCase() === owner.toLowerCase()) return true;
  g.__hoaxControls ??= new Map();
  const key = `${wallet.toLowerCase()}:${owner.toLowerCase()}`;
  const hit = g.__hoaxControls.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ok;
  const ok = await accountsClient().controls(wallet, getAddress(owner));
  g.__hoaxControls.set(key, { ok, at: Date.now() });
  return ok;
}

/** The request's host, as the browser saw it (for binding sign-in messages). */
export function requestHost(req: Request): string {
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
}
