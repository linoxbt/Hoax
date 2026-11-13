import Link from "next/link";
import { Accordion } from "@/components/home/Accordion";
import { HeroLive } from "@/components/home/HeroLive";
import { MarketTape } from "@/components/LiveMarkets";
import { LiveSimulator } from "@/components/Simulator";
import { Split } from "@/components/Ui";
import { NETWORK_NAMES, closeCost, usd } from "@/lib/format";
import { DEMO, getStore } from "@/lib/server";

export const dynamic = "force-dynamic";

// Liquidations keep no office hours: the sessions a 24/7 market runs through.
const SESSIONS: Array<[string, string]> = [
  ["Sydney", "22:00–07:00 UTC"],
  ["Tokyo", "00:00–09:00 UTC"],
  ["Hong Kong", "01:30–08:00 UTC"],
  ["London", "08:00–16:30 UTC"],
  ["New York", "14:30–21:00 UTC"],
];

// The loop, annotated on a chart. Numbers are from a real close on Shannon (receipt 69bdf902).
const NOTES: Array<{ k: string; t: string; p: string; x: number; y: number; act?: boolean }> = [
  { k: "01 Watch", t: "Health read every second", p: "Mark and funding move it while you sleep.", x: 2, y: 4 },
  { k: "02 Size", t: "Smallest close to target 1.60", p: "Solved from equity, margin and the live book.", x: 21.5, y: 4 },
  { k: "03 Gate", t: "0.064 vs 3.69 USDso", p: "The close costs far less than liquidation, so it may go.", x: 41, y: 4, act: true },
  { k: "04 Close", t: "0.8 of 2.96 SOL, one IOC order", p: "Health 1.18 → 1.60. Liquidation price moves away.", x: 60.5, y: 4, act: true },
  { k: "05 Prove", t: "Signed receipt, judged in 24 h", p: "The old liquidation price was reached. Saved.", x: 80, y: 4 },
];

// Not a stop-loss: the same bad night, two tools.
const STOP: Array<[string, string]> = [
  ["Triggers on", "a price you picked in advance"],
  ["Watches", "one market's price"],
  ["Closes", "the whole position"],
  ["Afterwards", "you're out of the trade"],
  ["Record", "a fill in your history"],
];
const HOAX: Array<[string, string]> = [
  ["Triggers on", "your account's health"],
  ["Watches", "mark, funding and every other position"],
  ["Closes", "the smallest slice that restores your target"],
  ["Afterwards", "you keep most of the position"],
  ["Record", "a signed receipt, judged after 24 hours"],
];

const FAQ: Array<[string, string]> = [
  [
    "What is Hoax?",
    "A bot you link to your dreamDEX account. It reads the health of every protected perp position each second and, when health slips to your trigger, closes the smallest slice that brings it back to your target. It only sends that order when it costs less than the liquidation it prevents.",
  ],
  [
    "Can Hoax move my funds?",
    "No. The link grants placeOrderFor and nothing else: no withdrawals, no transfers, and it cannot cancel your own orders. Every fill settles to your account. You can unlink it from Settings, or in dreamDEX, with one transaction.",
  ],
  [
    "How is it different from a stop-loss?",
    "A stop-loss throws you out of the trade at a price you picked in advance. Hoax watches health, not price, so it also catches funding and losses on your other positions, and it sells only the slice it needs. You keep most of the position.",
  ],
  [
    "Which markets and networks?",
    "Every dreamDEX perp market on Somnia Tokyo (Hideki) and Somnia Shannon. One engine runs per network, and one link covers every market on it.",
  ],
  [
    "What does it cost?",
    "No subscription. A close costs what the book charges for it, and a builder fee is added only if you approved one on chain. When a gas wallet is configured, the engine keeps your Hoax key topped up with gas.",
  ],
  [
    "What if Hoax can't act?",
    "If the mark is stale, the node is unreachable, or there is no liquidity within your max slippage, Hoax sends nothing and tells you why in Alerts. It lowers liquidation risk; it cannot remove it.",
  ],
];

export default async function Landing() {
  // The track record and the featured receipt are one part of the page: without the database the rest still renders.
  const data = await getStore()
    .then(async (store) => {
      const [stats, actions] = await Promise.all([store.stats(), store.listActions({ limit: 200 })]);
      const saved = actions.find((a) => a.outcome === "saved") ?? null;
      const cf = saved ? await store.getCounterfactual(saved.id) : null;
      return { stats, saved, cf };
    })
    .catch((err) => {
      console.error("track record unavailable:", err instanceof Error ? err.message : String(err));
      return null;
    });
  const stats = data?.stats ?? null;
  const saved = data?.saved ?? null;
  const sample = DEMO ? " · sample" : "";

  return (
    <>
      {/* hero */}
      <section className="h-hero">
        <Split as="h1" className="h1">
          Exit before the liquidation engine does.
        </Split>
        <div className="h-hero-side" data-reveal>
          <p>
            Hoax watches your leveraged dreamDEX perps every second and trims them back to safe health the moment they slip, <b>only when that is
            cheaper than liquidation</b>, with a signed receipt for every action.
          </p>
          <div className="h-cta">
            <Link className="pill" href="/start">
              Get protected
            </Link>
            <Link className="pill ghost" href="/how-it-works">
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* the desk: the live drawing in a window */}
      <section className="console" data-reveal>
        <div className="console-bar">
          <div className="console-dots" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="console-tabs" aria-hidden>
            <span className="on">Position</span>
            <span>Receipts</span>
            <span>Policy</span>
          </div>
          <div className="console-meta">
            <span>
              Trigger <b>1.25</b>
            </span>
            <span>
              Target <b>1.60</b>
            </span>
            <span>
              Cost gate <b>λ 0.5</b>
            </span>
          </div>
        </div>
        <HeroLive />
        <div className="console-tape">
          <MarketTape />
        </div>
      </section>

      {/* liquidations keep no office hours */}
      <section className="h-sec">
        <div className="h-night">
          <div className="h-dots" aria-hidden />
          <div className="h-label">
            <i />
            Always on
          </div>
          <Split className="h2">Liquidations keep no office hours.</Split>
          <p className="txt" data-reveal>
            Mark price and hourly funding move health on a position you are not watching. The liquidation engine never sleeps, so neither does Hoax: it
            reads every protected account each second, through every session.
          </p>
          <div className="h-sessions" data-reveal>
            {SESSIONS.map(([city, hours]) => (
              <div key={city}>
                <b>{city}</b>
                <span>{hours}</span>
              </div>
            ))}
            <div className="live">
              <b>Hoax</b>
              <span>● Every second</span>
            </div>
          </div>
        </div>
      </section>

      {/* priced against the real book */}
      <section className="h-sec">
        <div className="h-head">
          <div>
            <div className="h-label">
              <i />
              Cost gate
            </div>
            <Split className="h2">Priced against the real book.</Split>
          </div>
          <p className="txt" data-reveal>
            Liquidation sells your whole position into the bids and adds a 1% penalty. Hoax reads the same book first, and only trims when its close costs
            at most half of what liquidation would.
          </p>
        </div>
        <div className="h-book">
          <BookCard
            title="Liquidation"
            sub="2.96 SOL sold at once, plus a 1% penalty"
            fill={2.96}
            total="3.69"
            note="what the engine would have taken"
            tone="liq"
          />
          <BookCard title="Hoax" sub="0.8 SOL trimmed, inside max slippage" fill={0.8} total="0.064" note="what the close actually cost" tone="hoax" />
        </div>
        <p className="mono-s muted" style={{ marginTop: "1.2rem" }}>
          Book shape is an illustration. Sizes and costs are from a real close on Somnia Shannon, receipt 69bdf902.
        </p>
      </section>

      {/* the loop */}
      <section className="h-sec">
        <div className="h-head">
          <div>
            <div className="h-label act">
              <i />
              Five steps, one loop
            </div>
            <Split className="h2">Built around how a position gets saved.</Split>
          </div>
          <p className="txt" data-reveal>
            Each step runs where it matters: watching while health is fine, acting in the second it slips, and proving the outcome after the market has
            moved on.
          </p>
        </div>
        <div className="h-flow" data-reveal>
          <FlowChart />
          {NOTES.map((n) => (
            <div key={n.k} className={`h-note${n.act ? " act" : ""}`} style={{ left: `${n.x}%`, top: `${n.y}%` }}>
              <span className="k">{n.k}</span>
              <b>{n.t}</b>
              <p>{n.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* proof */}
      <section className="h-sec">
        <div className="h-head">
          <div>
            <div className="h-label">
              <i />
              Track record
            </div>
            <Split className="h2">Every action, on the record.</Split>
          </div>
          <p className="txt" data-reveal>
            Saved equity is only claimed when the old liquidation price was actually reached. Otherwise the close cost is shown as the price of insurance.
            Every receipt is public and signed.
          </p>
        </div>
        <div className="h-proof">
          <div className="h-stats" aria-label={DEMO ? "Track record, sample data" : "Track record"}>
            {(
              [
                [`Saved equity, up to${sample}`, stats ? usd(stats.savedEquity) : "–", "USDso", true],
                [`Saves${sample}`, stats ? String(stats.saves) : "–", "", false],
                [`Closes filled${sample}`, stats ? String(stats.actionsTaken) : "–", "", false],
                [`Misses${sample}`, stats ? String(stats.misses) : "–", "", false],
              ] as const
            ).map(([k, v, u, accent]) => (
              <div key={k}>
                <span className="mono-s soft">{k}</span>
                <span className={`num${accent ? " blue" : ""}`} style={accent ? { color: "var(--blue)" } : undefined}>
                  {v}
                  {u && <small>{u}</small>}
                </span>
              </div>
            ))}
          </div>
          {saved ? (
            <Link className="h-receipt" href={`/r/${saved.id}`}>
              <div className="between">
                <span className="tag saved">Saved</span>
                <span className="mono-s muted">
                  {(saved.receipt.chainId && NETWORK_NAMES[saved.receipt.chainId]) || "dreamDEX"} · {saved.market}
                  {sample}
                </span>
              </div>
              <div>
                <div className="mono-s soft">Equity preserved, up to</div>
                <div className="big" style={{ marginTop: "1rem" }}>
                  {data?.cf?.preserved != null ? usd(data.cf.preserved) : "–"}
                  <small>USDso</small>
                </div>
              </div>
              <div className="rows">
                <div className="r">
                  <span>Health</span>
                  <span>
                    {saved.healthBefore.toFixed(2)} → {saved.healthAfter != null ? saved.healthAfter.toFixed(2) : "–"}
                  </span>
                </div>
                <div className="r">
                  <span>Close cost</span>
                  <span>{closeCost(saved.cost, 3)}</span>
                </div>
                <div className="r">
                  <span>Liquidation would cost</span>
                  <span>{saved.estLiqCost != null ? `${usd(saved.estLiqCost)} USDso` : "–"}</span>
                </div>
              </div>
              <span className="mono-s blue">Open the receipt ↗</span>
            </Link>
          ) : (
            <div className="h-receipt">
              <span className="mono-s soft">Receipts</span>
              <p className="txt">No close has been judged saved yet. Every receipt still appears on the track record the moment it is signed.</p>
              <Link className="mono-s blue" href="/stats">
                See the track record ↗
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* not a stop-loss */}
      <section className="h-sec">
        <div className="h-head center">
          <div className="h-label">
            <i />
            How it compares
          </div>
          <Split className="h2">Not a stop-loss.</Split>
          <p className="txt" data-reveal>
            A stop-loss decides when you leave the trade. Hoax decides how little to sell so the liquidation engine never gets your position.
          </p>
        </div>
        <div className="h-vs">
          <Plan title="Stop-loss" sub="An exit you set and forget" rows={STOP} />
          <Plan title="Hoax" sub="Protection that keeps you in the trade" rows={HOAX} hoax />
        </div>
      </section>

      {/* trust */}
      <section className="h-sec">
        <div className="h-head">
          <div>
            <div className="h-label">
              <i />
              Security
            </div>
            <Split className="h2">Trades. Never withdraws.</Split>
          </div>
          <p className="txt" data-reveal>
            Hoax holds no funds and asks for one permission. The worst a leaked key could do is place orders, and the engine only ever sends small,
            immediate-or-cancel closes inside your slippage.
          </p>
        </div>
        <div className="h-trust">
          <div data-reveal>
            <span className="mono-s soft">01 · One permission</span>
            <div>
              <div className="h4">placeOrderFor, and nothing else</div>
              <p className="txt" style={{ marginTop: "1rem" }}>
                No withdrawals, no transfers, no cancelling your own orders. <code>cancelOrderFor</code> and <code>reduceOrderFor</code> stay with you.
              </p>
            </div>
          </div>
          <div data-reveal style={{ ["--d" as string]: "0.06s" }}>
            <span className="mono-s soft">02 · One key per account</span>
            <div>
              <div className="h4">Encrypted at rest</div>
              <p className="txt" style={{ marginTop: "1rem" }}>
                Each account gets its own key, AES-256-GCM encrypted in the engine&apos;s keystore. Keys never touch the database or another account.
              </p>
            </div>
          </div>
          <div data-reveal style={{ ["--d" as string]: "0.12s" }}>
            <span className="mono-s soft">03 · One transaction out</span>
            <div>
              <div className="h4">Revoke any time</div>
              <p className="txt" style={{ marginTop: "1rem" }}>
                Unlink from Settings or remove the bot in dreamDEX. One transaction from your wallet ends every permission at once.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* try it */}
      <section className="h-sec">
        <div className="h-head">
          <div>
            <div className="h-label act">
              <i />
              Try it
            </div>
            <Split className="h2">Run a crash.</Split>
          </div>
          <p className="txt" data-reveal>
            The engine&apos;s own sizing function, in your browser, started from ETH&apos;s live mark. Liquidation follows the venue model in the replay.
          </p>
        </div>
        <div className="sec" style={{ marginTop: 0 }}>
          <LiveSimulator />
        </div>
      </section>

      {/* questions */}
      <section className="h-sec">
        <div className="h-head center">
          <Split className="h2">Questions, answered.</Split>
          <p className="txt" data-reveal>
            How Hoax works, what it can and cannot do, and what it costs. Everything else is in the code.
          </p>
        </div>
        <div className="h-faq">
          <Accordion items={FAQ} />
        </div>
      </section>

      {/* the call */}
      <section className="h-sec">
        <div className="h-final">
          <div className="h-dots alt" aria-hidden />
          <Split className="h2">Protect your next position.</Split>
          <p className="txt" data-reveal>
            Connect the wallet you trade with. Linking takes one transaction, and another one ends it.
          </p>
          <div className="h-cta" data-reveal>
            <Link className="pill" href="/start">
              Get protected
            </Link>
            <Link className="pill ghost" href="/stats">
              See the track record
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** One side of the cost gate: the bids a close walks through, and what it cost. */
function BookCard({ title, sub, fill, total, note, tone }: { title: string; sub: string; fill: number; total: string; note: string; tone: "liq" | "hoax" }) {
  // An illustrative SOL-PERP bid ladder below a 83.69 mark.
  const levels: Array<[number, number]> = [
    [83.66, 0.9],
    [83.63, 0.6],
    [83.6, 1.1],
    [83.55, 0.7],
    [83.48, 0.5],
    [83.4, 0.8],
    [83.29, 0.6],
  ];
  const max = 1.2;
  let left = fill;
  return (
    <div className="h-book-card" data-reveal>
      <div className="between">
        <div>
          <div className="h4">{title}</div>
          <p className="txt" style={{ marginTop: "0.6rem" }}>
            {sub}
          </p>
        </div>
        <span className={`tag ${tone === "liq" ? "missed" : "pending"}`}>{tone === "liq" ? "Forced" : "Chosen"}</span>
      </div>
      <div className="h-ladder" aria-hidden>
        {levels.map(([px, size]) => {
          const take = Math.max(0, Math.min(size, left));
          left -= take;
          return (
            <div key={px} className={`h-lvl${take > 0 && tone === "hoax" ? " hit" : ""}`}>
              <span>{px.toFixed(2)}</span>
              <span className="bar">
                <i style={{ width: `${(size / max) * 100}%` }} />
                {take > 0 && tone === "liq" && <u style={{ width: `${(take / max) * 100}%` }} />}
                {take > 0 && tone === "hoax" && <i style={{ width: `${(take / max) * 100}%` }} />}
              </span>
              <b>{size.toFixed(1)}</b>
            </div>
          );
        })}
      </div>
      <div className="h-book-sum">
        <span className="mono-s soft">{note}</span>
        <span className="num" style={tone === "hoax" ? { color: "var(--blue)" } : undefined}>
          {total}
          <small>USDso</small>
        </span>
      </div>
    </div>
  );
}

function Plan({ title, sub, rows, hoax }: { title: string; sub: string; rows: Array<[string, string]>; hoax?: boolean }) {
  return (
    <div className={`h-plan${hoax ? " hoax" : ""}`} data-reveal>
      <div>
        <span className="mono-s soft">{hoax ? "Hoax" : "The usual exit"}</span>
        <div className="h3" style={{ marginTop: "1.2rem" }}>
          {title}
        </div>
        <p className="txt" style={{ marginTop: "0.8rem" }}>
          {sub}
        </p>
      </div>
      <ul>
        {rows.map(([k, v]) => (
          <li key={k}>
            <i>{hoax ? "✓" : "–"}</i>
            <span>
              <span className="mono-s muted" style={{ display: "block", marginBottom: "0.3rem" }}>
                {k}
              </span>
              {v}
            </span>
          </li>
        ))}
      </ul>
      {hoax && (
        <Link className="pill" href="/start" style={{ alignSelf: "flex-start" }}>
          Get protected
        </Link>
      )}
    </div>
  );
}

/** A position sliding to its trigger, trimmed once, then surviving the drop: candles in the desk's style. */
function FlowChart() {
  const W = 1200;
  const H = 600;
  const OFF = 150; // room above the chart for the callouts
  const n = 52;
  const trimAt = 25;
  // price path: drift, slide to the trigger, a little further, then recover
  const px = (i: number) => {
    if (i < 10) return OFF + 120 + Math.sin(i * 0.9) * 8 + i * 1.5;
    if (i <= trimAt) return OFF + 135 + ((i - 10) / (trimAt - 10)) ** 1.4 * 165;
    if (i <= trimAt + 7) return OFF + 300 + Math.sin(((i - trimAt) / 7) * Math.PI) * 42;
    return OFF + 300 - (i - trimAt - 7) * 9 + Math.sin(i * 1.3) * 7;
  };
  const x = (i: number) => 60 + (i * (W - 160)) / (n - 1);
  const ACT = OFF + 300;
  const LIQ0 = OFF + 368;
  const LIQ1 = OFF + 416;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A position slides to its trigger, Hoax trims it once, the liquidation price moves away, and the position survives the drop.">
      {Array.from({ length: 13 }, (_, i) => (
        <line key={`v${i}`} x1={i * 100} x2={i * 100} y1={0} y2={H} stroke="#1a1d20" strokeWidth="1" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1={0} x2={W} y1={i * 100 + 30} y2={i * 100 + 30} stroke="#1a1d20" strokeWidth="1" />
      ))}
      <g fontFamily="var(--mono)" fontSize="13">
        <line x1="40" x2={W - 110} y1={ACT} y2={ACT} stroke="#929699" strokeDasharray="8 6" />
        <text x={W - 100} y={ACT + 4} fill="#929699">
          Act · H 1.25
        </text>
        <line x1="40" x2={x(trimAt)} y1={LIQ0} y2={LIQ0} stroke="#6b7073" strokeDasharray="3 4" />
        <text x={x(trimAt) - 120} y={LIQ0 - 10} fill="#6b7073">
          Liq 83.29
        </text>
        <line x1={x(trimAt)} x2={W - 110} y1={LIQ1} y2={LIQ1} stroke="#fa3600" strokeWidth="1.4" />
        <text x={W - 100} y={LIQ1 + 4} fill="#fa3600">
          Liq 82.38
        </text>
        <path d={`M${x(trimAt)} ${LIQ0} V${LIQ1}`} stroke="#fa3600" strokeDasharray="2 3" />
      </g>
      {Array.from({ length: n }, (_, i) => {
        const a = px(i);
        const b = px(i + 1);
        const top = Math.min(a, b);
        const h = Math.max(3, Math.abs(a - b));
        const up = b < a;
        return (
          <g key={i} stroke={i < trimAt ? "#929699" : "#3e8fb3"} strokeWidth="1.3">
            <line x1={x(i)} x2={x(i)} y1={top - 6} y2={top + h + 6} />
            <rect x={x(i) - 4} y={top} width="8" height={h} rx="1" fill={up ? (i < trimAt ? "#929699" : "#3e8fb3") : "#0f1113"} />
          </g>
        );
      })}
      <rect x={x(trimAt) - 9} y={px(trimAt) - 9} width="18" height="18" rx="3" fill="#fa3600" />
      <circle cx={x(trimAt)} cy={px(trimAt)} r="20" fill="none" stroke="#fa3600" strokeOpacity="0.4" />
      <rect x={x(n - 3) - 7} y={px(n - 3) - 7} width="14" height="14" rx="3" fill="#e1e5e5" />
    </svg>
  );
}
