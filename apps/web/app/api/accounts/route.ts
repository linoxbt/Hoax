import { randomUUID } from "node:crypto";
import { bearer, controls, sessionWallet } from "@/lib/auth";
import { BAD_CHAIN, DEMO, chainOf, error, getStore, hashToken, isAddress, json, newToken, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Register a dreamDEX account for protection. The caller signs in with the
 * wallet that owns the account's Safe; the watcher then makes a dedicated Hoax
 * key for it, and the account only becomes active once that wallet links the
 * key on chain, which nobody else can do. Registering again reuses a
 * registration that is still waiting for its link.
 */
export async function POST(req: Request) {
  if (DEMO) return error(503, "The protection engine is offline on this deployment, so it cannot take new accounts yet.");
  if (rateLimited(req, 10, 60 * 60_000)) return error(429, "too many registrations from this address; try again later");
  const wallet = sessionWallet(bearer(req));
  if (!wallet) return error(401, "sign in with your wallet first");
  const body = (await req.json().catch(() => null)) as { owner?: string; chain?: number } | null;
  const owner = body?.owner?.trim() ?? "";
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const chainId = chainOf(req, body);
  if (!chainId) return error(400, BAD_CHAIN);
  if (!(await controls(wallet, owner, chainId))) return error(403, "this wallet does not own that dreamDEX account");

  const store = await getStore();
  const existing = await store.getAccountByOwner(owner, chainId);
  if (existing && existing.status !== "unlinked") {
    return json({ id: existing.id, owner: existing.owner, status: existing.status, hoaxKey: existing.hoaxKey });
  }
  // The wallet session manages the account; the legacy manage token is random and never shown.
  const account = await store.createAccount({ id: randomUUID(), owner, manageTokenHash: hashToken(newToken()), chainId });
  return json({ id: account.id, owner: account.owner, status: account.status, hoaxKey: account.hoaxKey }, { status: 201 });
}
