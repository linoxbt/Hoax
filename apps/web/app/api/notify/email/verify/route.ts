import { hashCode, siteUrl } from "@/lib/notify";
import { getStore } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The link in the confirmation email: confirms the address, then opens the dashboard's settings. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const ok = /^[A-Za-z0-9_-]{16,64}$/.test(code) && (await (await getStore()).verifyNotifyTarget("email", hashCode(code), new Date())) !== null;
  return Response.redirect(`${siteUrl()}/app/settings?email=${ok ? "confirmed" : "expired"}#alerts`, 303);
}
