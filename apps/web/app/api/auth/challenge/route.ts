import { HIDEKI, isNetworkId } from "@hoax/chain";
import { challenge, requestHost } from "@/lib/auth";
import { BAD_CHAIN, clientIp, error, isAddress, json, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The sign-in message for a wallet to sign. Body: { address, chain? } (the wallet's network; Hideki when absent). */
export async function POST(req: Request) {
  if (await rateLimited(`signin-ip:${clientIp(req)}`, 60, 10 * 60_000)) return error(429, "too many sign-in attempts; try again shortly");
  const body = (await req.json().catch(() => null)) as { address?: string; chain?: unknown } | null;
  const address = body?.address?.trim() ?? "";
  if (!isAddress(address)) return error(400, "address must be a 0x address");
  const chainId = body?.chain === undefined || body?.chain === null ? HIDEKI.id : Number(body.chain);
  if (!isNetworkId(chainId)) return error(400, BAD_CHAIN);
  const host = requestHost(req);
  if (!host) return error(400, "sign-in is only issued for this site's own address (HOAX_SITE_HOSTS)");
  return json(challenge(address, host, chainId));
}
