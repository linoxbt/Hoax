import { challenge, requestHost } from "@/lib/auth";
import { error, isAddress, json, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The sign-in message for a wallet to sign. Body: { address }. */
export async function POST(req: Request) {
  if (rateLimited(req, 60, 10 * 60_000)) return error(429, "too many sign-in attempts; try again shortly");
  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  const address = body?.address?.trim() ?? "";
  if (!isAddress(address)) return error(400, "address must be a 0x address");
  return json(challenge(address, requestHost(req)));
}
