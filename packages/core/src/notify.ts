// Alerts outside the dashboard: one notice, rendered for Telegram and for email, and
// sent through the Telegram Bot API or an email provider's HTTP API (Resend or
// Brevo). No SDKs: plain fetch, injectable for tests. Secrets come from the caller.

export interface Notice {
  /** One line: "Hoax closed 0.8 SOL on SOL-PERP". */
  title: string;
  /** The facts, one per line. */
  lines: string[];
  /** A page to open, such as the signed receipt. */
  link?: { label: string; url: string };
  tone: "info" | "good" | "warn" | "bad";
}

export interface EmailConfig {
  provider: "resend" | "brevo";
  apiKey: string;
  /** "Hoax <alerts@example.com>" or a bare address. */
  from: string;
}

type Fetch = typeof fetch;

const MARK: Record<Notice["tone"], string> = { info: "🔵", good: "✅", warn: "⚠️", bad: "🔴" };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The notice as a Telegram message in HTML parse mode. */
export function telegramText(n: Notice): string {
  const out = [`${MARK[n.tone]} <b>${escapeHtml(n.title)}</b>`, ...n.lines.map(escapeHtml)];
  if (n.link) out.push(`<a href="${escapeHtml(n.link.url)}">${escapeHtml(n.link.label)}</a>`);
  return out.join("\n");
}

/** Send one Telegram message. Throws with Telegram's description when it refuses. */
export async function sendTelegram(token: string, chatId: string, text: string, f: Fetch = fetch): Promise<void> {
  const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    throw new Error(`telegram ${res.status}: ${body?.description ?? "refused"}`);
  }
}

/** The notice as an email: a subject, a plain-text body and a small HTML body in Hoax's colours. */
export function emailContent(n: Notice): { subject: string; text: string; html: string } {
  const text = [n.title, "", ...n.lines, ...(n.link ? ["", `${n.link.label}: ${n.link.url}`] : []), "", "Hoax · market intelligence for dreamDEX perps"].join("\n");
  const color = n.tone === "bad" ? "#d6402b" : n.tone === "warn" ? "#a5650c" : n.tone === "good" ? "#147b67" : "#1954f5";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f9fe;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#101b35">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fe;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e9f4;border-radius:16px">
<tr><td style="padding:28px 28px 8px"><span style="display:inline-block;background:#1954f5;color:#fff;font-weight:700;border-radius:8px;padding:4px 10px;font-size:14px">hoax</span></td></tr>
<tr><td style="padding:12px 28px 0;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${color}">Alert</td></tr>
<tr><td style="padding:6px 28px 12px;font-size:22px;line-height:1.3;font-weight:600">${escapeHtml(n.title)}</td></tr>
${n.lines.map((l) => `<tr><td style="padding:2px 28px;font-size:15px;line-height:1.5;color:#2a3654">${escapeHtml(l)}</td></tr>`).join("\n")}
${n.link ? `<tr><td style="padding:20px 28px 4px"><a href="${escapeHtml(n.link.url)}" style="display:inline-block;background:#1954f5;color:#fff;text-decoration:none;border-radius:8px;padding:11px 18px;font-size:15px">${escapeHtml(n.link.label)} →</a></td></tr>` : ""}
<tr><td style="padding:24px 28px 28px;font-size:12px;color:#8a95ad">Hoax · market intelligence for dreamDEX perps. You get this because you linked this address in Hoax's settings; unlink it there at any time.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `Hoax · ${n.title}`, text, html };
}

/** "Hoax <a@b.c>" → name and address; a bare address keeps the name Hoax. */
export function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(from);
  return m ? { name: m[1] || "Hoax", email: m[2] } : { name: "Hoax", email: from.trim() };
}

/** Send one email through the configured provider. Throws when the provider refuses. */
export async function sendEmail(cfg: EmailConfig, to: string, c: { subject: string; text: string; html: string }, f: Fetch = fetch): Promise<void> {
  const res =
    cfg.provider === "resend"
      ? await f("https://api.resend.com/emails", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({ from: cfg.from, to: [to], subject: c.subject, text: c.text, html: c.html }),
          signal: AbortSignal.timeout(10_000),
        })
      : await f("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "content-type": "application/json", "api-key": cfg.apiKey },
          body: JSON.stringify({ sender: parseFrom(cfg.from), to: [{ email: to }], subject: c.subject, textContent: c.text, htmlContent: c.html }),
          signal: AbortSignal.timeout(10_000),
        });
  if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

/** Email settings from the environment: RESEND_API_KEY or BREVO_API_KEY, and HOAX_EMAIL_FROM. Null when not configured. */
export function emailConfigFromEnv(env: Record<string, string | undefined>): EmailConfig | null {
  const from = env.HOAX_EMAIL_FROM;
  if (!from) return null;
  if (env.RESEND_API_KEY) return { provider: "resend", apiKey: env.RESEND_API_KEY, from };
  if (env.BREVO_API_KEY) return { provider: "brevo", apiKey: env.BREVO_API_KEY, from };
  return null;
}

/** A plausible email address: one @, a dot in the domain, no spaces, at most 254 characters. */
export function isEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
