import { getStore, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Saved equity next to the price of insurance, so the benefit is never overstated. */
export async function GET() {
  const store = await getStore();
  return json(await store.stats());
}
