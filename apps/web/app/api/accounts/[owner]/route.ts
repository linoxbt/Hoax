import { HIDEKI, isNetworkId } from "@hoax/chain";
import { authorized, error, getStore, isAddress, json } from "@/lib/server";
import { accountView } from "@/lib/views";

export const dynamic = "force-dynamic";

/** Status, policies, positions with live health. Alerts only for the token holder. */
export async function GET(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const store = await getStore();
  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get("chain") ?? HIDEKI.id);
  if (!isNetworkId(chainId)) return error(400, "chain must be 50312 (Shannon) or 50383 (Hideki)");
  const id = url.searchParams.get("account");
  let account = id ? await store.getAccount(id) : await store.getAccountByOwner(owner, chainId);
  if (account && (account.owner !== owner.toLowerCase() || account.chainId !== chainId)) account = null;
  const isOwner = account ? await authorized(req, account) : false;
  try {
    return json(await accountView(store, owner, account, isOwner, chainId));
  } catch (err) {
    return error(502, `could not read the chain: ${String(err).slice(0, 160)}`);
  }
}
