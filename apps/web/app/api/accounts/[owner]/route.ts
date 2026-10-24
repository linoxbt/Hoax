import { HIDEKI, isNetworkId } from "@hoax/chain";
import { authorized, clientIp, error, failure, getStore, isAddress, isUuid, json, rateLimitedLocal } from "@/lib/server";
import { accountView } from "@/lib/views";

export const dynamic = "force-dynamic";

/**
 * Status and positions with live health for anyone (public chain data);
 * policies and alerts only for the wallet that owns the account.
 */
export async function GET(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  // The dashboard polls every 5 s; this leaves room for that and stops a scraper.
  if (rateLimitedLocal(`account-ip:${clientIp(req)}`, 240, 60_000)) return error(429, "too many requests; try again shortly");
  const store = await getStore();
  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get("chain") ?? HIDEKI.id);
  if (!isNetworkId(chainId)) return error(400, "chain must be 50312 (Shannon) or 50383 (Hideki)");
  const id = url.searchParams.get("account");
  if (id && !isUuid(id)) return error(400, "account must be a registration id");
  let account = id ? await store.getAccount(id) : await store.getAccountByOwner(owner, chainId);
  if (account && (account.owner !== owner.toLowerCase() || account.chainId !== chainId)) account = null;
  // A failed ownership read shows the public view; it never locks the owner out for long (not cached).
  const isOwner = account ? await authorized(req, account).catch(() => false) : false;
  try {
    return json(await accountView(store, owner, account, isOwner, chainId));
  } catch (err) {
    return failure(502, "could not read the chain; try again", err);
  }
}
