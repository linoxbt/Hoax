import { telegramText } from "@hoax/core";
import { MemoryStore } from "@hoax/db";
import { describe, expect, it } from "vitest";
import { Notifier, alertNotice, closeNotice, outcomeNotice } from "../src/notifier.ts";

const quiet = { info() {}, warn() {}, error() {}, debug() {} } as never;
const OWNER = "0x00000000000000000000000000000000000000Cd";

function setup(opts: { telegram?: boolean; fail?: (url: string) => Response | null } = {}) {
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
      siteUrl: "https://hoax.test",
      networkName: "Somnia Hideki",
    },
    quiet,
    () => now,
    f,
  );
  return { store, n, calls, tick: (ms: number) => (now += ms) };
}

async function link(store: MemoryStore, chatId: string, owner = OWNER) {
  await store.startNotifyTarget({ owner, kind: "telegram", target: null, codeHash: `c-${owner}`, expiresAt: new Date(Date.now() + 60_000) });
  await store.verifyNotifyTarget("telegram", `c-${owner}`, new Date(), chatId);
}

describe("Notifier", () => {
  it("sends only to a confirmed chat, through the Bot API", async () => {
    const { store, n, calls } = setup();
    const other = "0x00000000000000000000000000000000000000Ee";
    await store.startNotifyTarget({ owner: other, kind: "telegram", target: null, codeHash: "x", expiresAt: new Date(Date.now() + 60_000) });
    expect(await n.deliver(other, alertNotice(n, "paused", "Paused."))).toBe(0);
    await link(store, "777");
    expect(await n.deliver(OWNER, alertNotice(n, "paused", "Paused."))).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "777", parse_mode: "HTML" });
    expect(String(calls[0].body.text)).toContain("Hoax paused your account");
  });

  it("sends the same notice once per 15 minutes", async () => {
    const { store, n, calls, tick } = setup();
    await link(store, "777");
    const notice = alertNotice(n, "skipped", "Hoax did not close on ETH-PERP: no liquidity within max slippage.");
    expect(await n.deliver(OWNER, notice)).toBe(1);
    expect(await n.deliver(OWNER, notice)).toBe(0);
    tick(16 * 60_000);
    expect(await n.deliver(OWNER, notice)).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("unlinks a Telegram chat that blocked the bot", async () => {
    const { store, n } = setup({
      fail: () => new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was blocked by the user" }), { status: 403 }),
    });
    await link(store, "777");
    expect(await n.deliver(OWNER, alertNotice(n, "paused", "Paused."))).toBe(0);
    expect(await store.listNotifyTargets(OWNER)).toEqual([]);
  });

  it("does nothing when no channel is configured", async () => {
    const { store, n, calls } = setup({ telegram: false });
    await link(store, "777");
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
    expect(telegramText(close)).toContain('<a href="https://hoax.test/r/abc">Open the signed receipt</a>');
  });
});
