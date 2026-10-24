import { error, getStore, json, revocationKeyFor, sessionFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Sign out everywhere: every session this wallet holds, this one included,
 * stops working (for a smart wallet, every session on this one network).
 */
export async function POST(req: Request) {
  const session = await sessionFor(req);
  if (!session) return error(401, "not signed in");
  await (await getStore()).revokeSessions(revocationKeyFor(session), new Date());
  return json({ ok: true });
}
