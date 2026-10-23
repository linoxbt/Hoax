import { authorized, error, getStore, isAddress, json } from "@/lib/server";
import { accountView } from "@/lib/views";

export const dynamic = "force-dynamic";

/** Status, policies, positions with live health. Alerts only for the token holder. */
export async function GET(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const store = await getStore();
  const url = new URL(req.url);
  const id = url.searchParams.get("account");
  let account = id ? await store.getAccount(id) : await store.getAccountByOwner(owner);
  if (account && account.owner !== owner.toLowerCase()) account = null;
  const isOwner = account ? await authorized(req, account) : false;
  try {
    return json(await accountView(store, owner, account, isOwner));
  } catch (err) {
    return error(502, `could not read the chain: ${String(err).slice(0, 160)}`);
  }
}
