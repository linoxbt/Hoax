import { error, getStore, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Receipts, newest first. Receipts are public: every field comes from public chain data. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner");
  if (owner && !isAddress(owner)) return error(400, "owner must be a 0x address");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const store = await getStore();
  const actions = await store.listActions({ owner: owner ?? undefined, limit });
  const withCf = await Promise.all(actions.map(async (a) => ({ ...a, counterfactual: await store.getCounterfactual(a.id) })));
  return json(withCf);
}
