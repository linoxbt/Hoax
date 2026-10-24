import { randomUUID } from "node:crypto";
import { networkOf } from "@hoax/chain";
import { getAddress } from "viem";
import { controls } from "@/lib/auth";
import { BAD_CHAIN, DEMO, chainOf, clientIp, error, failure, getStore, getVenue, isAddress, json, rateLimited, sessionFor } from "@/lib/server";

const HOUR_MS = 60 * 60_000;

export const dynamic = "force-dynamic";

/**
 * Register a dreamDEX account for protection. The caller signs in with the
 * wallet that owns the account's Safe; the watcher then makes a dedicated Hoax
 * key for it, and the account only becomes active once that wallet links the
 * key on chain, which nobody else can do. Registering again reuses a
 * registration that is active or still waiting for its link.
 */
export async function POST(req: Request) {
  if (DEMO) return error(503, "The protection engine is offline on this deployment, so it cannot take new accounts yet.");
  if (await rateLimited(`register-ip:${clientIp(req)}`, 30, HOUR_MS)) return error(429, "too many registrations from this address; try again later");
  const body = (await req.json().catch(() => null)) as { owner?: string; chain?: number } | null;
  const owner = body?.owner?.trim() ?? "";
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const chainId = chainOf(req, body);
  if (!chainId) return error(400, BAD_CHAIN);
  const session = await sessionFor(req, chainId);
  if (!session) return error(401, "sign in with your wallet first");
  const wallet = session.wallet;

  let owns: boolean;
  try {
    owns = await controls(wallet, owner, chainId, { fresh: true });
  } catch (err) {
    return failure(502, "could not check the account on chain; try again", err);
  }
  if (!owns) return error(403, "this wallet does not own that dreamDEX account");

  const store = await getStore();
  const existing = await store.getAccountByOwner(owner, chainId);
  if (existing && (existing.status === "active" || existing.status === "pending_key" || existing.status === "pending_link")) {
    return json({ id: existing.id, owner: existing.owner, status: existing.status, hoaxKey: existing.hoaxKey });
  }

  // Every new registration makes the watcher a key (and, once linked, may get
  // gas). A Safe the wallet owns already exists on chain, which costs gas to
  // make; a bare wallet costs nothing, so registering one as its own account
  // needs margin or a position on dreamDEX first.
  const venue = getVenue(chainId);
  const bank = networkOf(chainId).addresses.marginBank;
  if (wallet.toLowerCase() === owner.toLowerCase() && venue && bank) {
    try {
      const m = await venue.readMargin(bank, getAddress(owner));
      if (m.equity <= 0n && m.activePools.length === 0) {
        return error(400, "this account has no margin or positions on dreamDEX yet; deposit and trade first, then turn on Hoax");
      }
    } catch (err) {
      return failure(502, "could not read the account's margin on chain; try again", err);
    }
  }

  // Capped per wallet first (the caller's own budget), then overall.
  if (await rateLimited(`register-wallet:${wallet.toLowerCase()}`, 5, HOUR_MS)) return error(429, "too many registrations from this wallet; try again later");
  if (await rateLimited("register-all", 200, HOUR_MS)) return error(429, "Hoax is taking too many new accounts right now; try again in an hour");
  const account = await store.createAccount({ id: randomUUID(), owner, chainId });
  return json({ id: account.id, owner: account.owner, status: account.status, hoaxKey: account.hoaxKey }, { status: 201 });
}
