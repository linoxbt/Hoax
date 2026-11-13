import { isEmail } from "@hoax/core";
import { CODE_TTL_MS, hashCode, mailTo, maskEmail, newCode, notifyConfig, replyTelegram, siteUrl } from "@/lib/notify";
import { BAD_CHAIN, DEMO, authorized, chainOf, error, failure, getStore, isAddress, json, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

type Body = { kind?: string; email?: string; chain?: number } | null;

async function owned(req: Request, owner: string, body: Body, fresh: boolean) {
  if (!isAddress(owner)) return { res: error(400, "owner must be a 0x address") };
  const chainId = chainOf(req, body);
  if (!chainId) return { res: error(400, BAD_CHAIN) };
  const store = await getStore();
  const account = await store.getAccountByOwner(owner, chainId);
  if (!account) return { res: error(404, "no Hoax registration for this wallet") };
  try {
    if (!(await authorized(req, account, { fresh }))) return { res: error(401, "sign in with the wallet that owns this account") };
  } catch (err) {
    return { res: failure(502, "could not check the account on chain; try again", err) };
  }
  return { store, account };
}

/** Where this account's alerts go besides the dashboard. */
export async function GET(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const o = await owned(req, owner, null, false);
  if ("res" in o) return o.res;
  const cfg = notifyConfig();
  const rows = await o.store.listNotifyTargets(o.account.owner);
  const tg = rows.find((r) => r.kind === "telegram");
  const em = rows.find((r) => r.kind === "email");
  return json({
    telegram: { available: Boolean(cfg.telegramToken && cfg.telegramBot), linked: Boolean(tg?.verified), pending: Boolean(tg && !tg.verified) },
    email: {
      available: Boolean(cfg.email),
      address: em?.target ? maskEmail(em.target) : null,
      verified: Boolean(em?.verified),
    },
  });
}

/**
 * Link a channel or send a test.
 * { kind: "telegram" } → { link }: open it in Telegram and press Start.
 * { kind: "email", email } → a confirmation link is sent to that address.
 * { kind: "test" } → one test message to every confirmed channel.
 */
export async function POST(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const body = (await req.json().catch(() => null)) as Body;
  const o = await owned(req, owner, body, true);
  if ("res" in o) return o.res;
  if (DEMO) return error(400, "alert channels are not available for the sample account");
  const cfg = notifyConfig();
  const who = o.account.owner.toLowerCase();

  if (body?.kind === "telegram") {
    if (!cfg.telegramToken || !cfg.telegramBot) return error(503, "Telegram alerts are not configured on this deployment");
    const code = newCode();
    await o.store.startNotifyTarget({ owner: who, kind: "telegram", target: null, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
    return json({ link: `https://t.me/${cfg.telegramBot}?start=${code}` });
  }

  if (body?.kind === "email") {
    if (!cfg.email) return error(503, "email alerts are not configured on this deployment");
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isEmail(email)) return error(400, "enter a valid email address");
    if (await rateLimited(`notify-email:${who}`, 5, 60 * 60_000)) return error(429, "too many confirmation emails; try again in an hour");
    const code = newCode();
    await o.store.startNotifyTarget({ owner: who, kind: "email", target: email, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
    try {
      await mailTo(email, {
        title: "Confirm your Hoax alerts",
        lines: [
          `Confirm this address to get alerts for the dreamDEX account ${who.slice(0, 6)}…${who.slice(-4)}: every close Hoax sends, saves, liquidations and anything that needs you.`,
          "The link works for 30 minutes. If you did not ask for this, ignore this email.",
        ],
        link: { label: "Confirm email alerts", url: `${siteUrl()}/api/notify/email/verify?code=${code}` },
        tone: "info",
      });
    } catch (err) {
      await o.store.deleteNotifyTarget(who, "email");
      return failure(502, "the confirmation email could not be sent; try again", err);
    }
    return json({ sent: true, address: maskEmail(email) });
  }

  if (body?.kind === "test") {
    if (await rateLimited(`notify-test:${who}`, 5, 10 * 60_000)) return error(429, "too many test messages; try again in a few minutes");
    const rows = (await o.store.listNotifyTargets(who)).filter((r) => r.verified && r.target);
    const test = {
      title: "Test alert from Hoax",
      lines: ["Alerts for your dreamDEX account will arrive here: closes, saves, liquidations and anything that needs you."],
      link: { label: "Open your dashboard", url: `${siteUrl()}/app` },
      tone: "good" as const,
    };
    let sent = 0;
    for (const r of rows) {
      try {
        if (r.kind === "telegram" && cfg.telegramToken) {
          await replyTelegram(r.target!, test);
          sent++;
        } else if (r.kind === "email" && cfg.email) {
          await mailTo(r.target!, test);
          sent++;
        }
      } catch (err) {
        console.error("test alert failed", r.kind, err instanceof Error ? err.message : String(err));
      }
    }
    return json({ sent });
  }

  return error(400, 'kind must be "telegram", "email" or "test"');
}

/** Unlink a channel: ?kind=telegram|email. */
export async function DELETE(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const o = await owned(req, owner, null, true);
  if ("res" in o) return o.res;
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "telegram" && kind !== "email") return error(400, 'kind must be "telegram" or "email"');
  await o.store.deleteNotifyTarget(o.account.owner, kind);
  return json({ removed: kind });
}
