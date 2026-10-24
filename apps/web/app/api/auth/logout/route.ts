import { error, getStore, json, sessionFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Sign out everywhere: every session this wallet holds, this one included, stops working. */
export async function POST(req: Request) {
  const session = await sessionFor(req);
  if (!session) return error(401, "not signed in");
  await (await getStore()).revokeSessions(session.wallet, new Date());
  return json({ ok: true });
}
