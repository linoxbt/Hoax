// Alert channels on the web side: linking Telegram and email, confirming them,
// and sending the confirmation and test messages. The engine sends the alerts
// themselves (services/watcher/src/notifier.ts).
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type Notice, emailConfigFromEnv, emailContent, sendEmail, sendTelegram, telegramText } from "@hoax/core";

/** How long a link code or confirmation link works. */
export const CODE_TTL_MS = 30 * 60_000;

export function notifyConfig() {
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || null,
    /** The bot's username without the @, for the t.me link. */
    telegramBot: (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "") || null,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
    email: emailConfigFromEnv(process.env),
  };
}

export const siteUrl = () =>
  (
    process.env.HOAX_SITE_URL ??
    process.env.URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://usehoax.netlify.app")
  ).replace(/\/+$/, "");

/** A fresh code: 22 URL-safe characters, valid in a Telegram start parameter. */
export const newCode = () => randomBytes(16).toString("base64url");
export const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** Whether a webhook request carries the secret set with setWebhook. */
export function webhookAuthorized(req: Request): boolean {
  const want = notifyConfig().webhookSecret;
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Telegram's own reply to a chat, for the webhook. */
export async function replyTelegram(chatId: string, n: Notice): Promise<void> {
  const token = notifyConfig().telegramToken;
  if (token) await sendTelegram(token, chatId, telegramText(n));
}

export async function mailTo(to: string, n: Notice): Promise<void> {
  const cfg = notifyConfig().email;
  if (!cfg) throw new Error("email is not configured");
  await sendEmail(cfg, to, emailContent(n));
}

/** "ab***@gmail.com": enough to recognise, not enough to harvest. */
export function maskEmail(e: string): string {
  const [user, domain] = e.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}
