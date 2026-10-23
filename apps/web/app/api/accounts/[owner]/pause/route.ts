import { authorized, error, getStore, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Pause or resume Hoax for this wallet. Body: { paused: boolean }. */
export async function POST(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const store = await getStore();
  const account = await store.getAccountByOwner(owner);
  if (!account) return error(404, "no Hoax registration for this wallet");
  if (!authorized(req, account)) return error(401, "missing or wrong manage token");
  const body = (await req.json().catch(() => null)) as { paused?: boolean } | null;
  if (typeof body?.paused !== "boolean") return error(400, "paused must be true or false");
  await store.setPaused(account.id, body.paused);
  return json({ paused: body.paused });
}
