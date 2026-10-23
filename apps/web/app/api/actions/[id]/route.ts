import { error, getStore, json } from "@/lib/server";
import { receiptView } from "@/lib/views";

export const dynamic = "force-dynamic";

/** One receipt with tx links, the counterfactual and a signature check. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(400, "bad receipt id");
  const store = await getStore();
  const action = await store.getAction(id);
  if (!action) return error(404, "no such receipt");
  return json(await receiptView(action, await store.getCounterfactual(id)));
}
