import { BAD_CHAIN, authorized, chainOf, error, getStore, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Pause or resume Hoax for this account. Body: { paused: boolean, chain?: number }. */
export async function POST(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const body = (await req.json().catch(() => null)) as { paused?: boolean; chain?: number } | null;
  const chainId = chainOf(req, body);
  if (!chainId) return error(400, BAD_CHAIN);
  const store = await getStore();
  const account = await store.getAccountByOwner(owner, chainId);
  if (!account) return error(404, "no Hoax registration for this wallet");
  if (!(await authorized(req, account))) return error(401, "sign in with the wallet that owns this account");
  if (typeof body?.paused !== "boolean") return error(400, "paused must be true or false");
  await store.setPaused(account.id, body.paused);
  return json({ paused: body.paused });
}
