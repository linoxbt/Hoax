import { emailContent, telegramText } from "@hoax/core";
import { MemoryStore } from "@hoax/db";
import { describe, expect, it } from "vitest";
import { Notifier, alertNotice, closeNotice, outcomeNotice } from "../src/notifier.ts";

const quiet = { info() {}, warn() {}, error() {}, debug() {} } as never;
const OWNER = "0x00000000000000000000000000000000000000Cd";

function setup(opts: { telegram?: boolean; email?: boolean; fail?: (url: string) => Response | null } = {}) {
  const store = new MemoryStore();
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return opts.fail?.(url) ?? new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  let now = 1_000_000;
  const n = new Notifier(
    store,
    {
      telegramToken: opts.telegram === false ? null : "TOKEN",
      email: opts.email === false ? null : { provider: "resend", apiKey: "KEY", from: "Hoax <alerts@hoax.test>" },
      siteUrl: "https://hoax.test",
      networkName: "Somnia Hideki",
    },
    quiet,
    () => now,
    f,
  );
  return { store, n, calls, tick: (ms: number) => (now += ms) };
}

async function link(store: MemoryStore, kind: "telegram" | "email", target: string) {
  await store.startNotifyTarget({ owner: OWNER, kind, target: kind === "email" ? target : null, codeHash: `${kind}-c`, expiresAt: new Date(Date.now() + 60_000) });
  await store.verifyNotifyTarget(kind, `${kind}-c`, new Date(), kind === "telegram" ? target : undefined);
}

describe("Notifier", () => {
  it("sends only to confirmed channels, through Telegram and the email provider", async () => {
    const { store, n, calls } = setup();
    const other = "0x00000000000000000000000000000000000000Ee";
    await store.startNotifyTarget({ owner: other, kind: "email", target: "pending@x.co", codeHash: "x", expiresAt: new Date(Date.now() + 60_000) });
    expect(await n.deliver(other, alertNotice(n, "paused", "Paused."))).toBe(0);
    await link(store, "telegram", "777");
    await link(store, "email", "me@x.co");
    expect(await n.deliver(OWNER, alertNotice(n, "paused", "Paused."))).toBe(2);
    const tg = calls.find((c) => c.url.includes("api.telegram.org/botTOKEN/sendMessage"));
    expect(tg?.body).toMatchObject({ chat_id: "777", parse_mode: "HTML" });
    expect(String(tg?.body.text)).toContain("Hoax paused your account");
    const mail = calls.find((c) => c.url === "https://api.resend.com/emails");
    expect(mail?.body).toMatchObject({ to: ["me@x.co"], subject: "Hoax · Hoax paused your account" });
    expect(calls).toHaveLength(2);
  });

  it("sends the same notice once per 15 minutes", async () => {
    const { store, n, calls, tick } = setup({ email: false });
    await link(store, "telegram", "777");
    const notice = alertNotice(n, "skipped", "Hoax did not close on ETH-PERP: no liquidity within max slippage.");
    expect(await n.deliver(OWNER, notice)).toBe(1);
    expect(await n.deliver(OWNER, notice)).toBe(0);
    tick(16 * 60_000);
    expect(await n.deliver(OWNER, notice)).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("unlinks a Telegram chat that blocked the bot", async () => {
    const { store, n } = setup({
      email: false,
      fail: () => new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was blocked by the user" }), { status: 403 }),
    });
    await link(store, "telegram", "777");
    expect(await n.deliver(OWNER, alertNotice(n, "paused", "Paused."))).toBe(0);
    expect(await store.listNotifyTargets(OWNER)).toEqual([]);
  });

  it("does nothing when no channel is configured", async () => {
    const { store, n, calls } = setup({ telegram: false, email: false });
    await link(store, "telegram", "777");
    expect(n.enabled).toBe(false);
    expect(await n.deliver(OWNER, alertNotice(n, "paused", "Paused."))).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("writes closes and outcomes with the facts and the receipt link", () => {
    const { n } = setup();
    const close = closeNotice(n, {
      id: "abc",
      market: "SOL-PERP",
      side: "long",
      filled: 800_000_000n,
      baseDecimals: 9,
      healthBefore: 1.18,
      healthAfter: 1.6,
      cost: 64_000_000_000_000_000n,
      estLiqCost: 3_690_000_000_000_000_000n,
    });
    expect(close.title).toBe("Hoax closed 0.8 SOL on SOL-PERP");
    expect(close.lines).toContain("Health 1.18 → 1.60");
    expect(close.lines.join(" ")).toContain("0.064 USDso");
    expect(close.link?.url).toBe("https://hoax.test/r/abc");
    const saved = outcomeNotice(n, { id: "abc", market: "SOL-PERP", outcome: "saved", preserved: 24_500_000_000_000_000_000n });
    expect(saved.tone).toBe("good");
    expect(saved.lines.join(" ")).toContain("24.5 USDso");
    // Rendered safely for both channels.
    const t = telegramText({ ...close, title: "<b>x</b> & y" });
    expect(t).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(emailContent(close).text).toContain("Open the signed receipt: https://hoax.test/r/abc");
  });
});
