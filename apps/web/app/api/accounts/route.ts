import { randomUUID } from "node:crypto";
import { DEMO, error, getStore, hashToken, isAddress, json, newToken, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Register a wallet for protection. The watcher then makes a dedicated Hoax key
 * for it; the response's token is shown once and is what manages Hoax for this
 * wallet afterwards. A registration only becomes active when the wallet's owner
 * links that key in dreamDEX, which nobody else can do.
 */
export async function POST(req: Request) {
  if (DEMO) return error(503, "This deployment runs on demo data with no watcher, so it cannot protect a wallet yet. Onboarding opens once the watcher is live.");
  if (rateLimited(req, 10, 60 * 60_000)) return error(429, "too many registrations from this address; try again later");
  const body = (await req.json().catch(() => null)) as { owner?: string } | null;
  const owner = body?.owner?.trim() ?? "";
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const store = await getStore();
  // A wallet may register again (a new key replaces the old one once it is linked).
  const token = newToken();
  const account = await store.createAccount({ id: randomUUID(), owner, manageTokenHash: hashToken(token) });
  return json({ id: account.id, owner: account.owner, status: account.status, token }, { status: 201 });
}
