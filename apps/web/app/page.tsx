import Link from "next/link";
import { Accordion } from "@/components/home/Accordion";
import { AreaChart, timeLabels } from "@/components/home/AreaChart";
import { Brief } from "@/components/home/Brief";
import { type ExplorerMarket, SignalExplorer } from "@/components/home/SignalExplorer";
import { Arrow, Btn, Eyebrow, Split } from "@/components/Ui";
import { NETWORK_NAMES, closeCost, usd } from "@/lib/format";
import { RADAR_CHAINS, type RadarSignal, type RadarSnapshot, radarSignals } from "@/lib/radar";
import { NET_SHORT, base, compact, hhmm, usdso } from "@/lib/radarFormat";
import { DEMO, getStore } from "@/lib/server";

export const dynamic = "force-dynamic";

const FAQ: Array<[string, string]> = [
  [
    "Is Hoax a trading platform?",
    "No. Trading happens on dreamDEX. Hoax reads dreamDEX's public data (every liquidation, on Somnia Tokyo and Shannon) and, if you link it, protects your own positions. It never takes custody of funds.",
  ],
  [
    "Where does the data come from?",
    "From dreamDEX's markets indexer and the chain itself. Radar reads every liquidation event as the indexer records it, and prices each one with the penalty and minimum spread read from the LiquidationEngine. dreamDEX's test pools are left out.",
  ],
  [
    "Does a signal tell me what happens next?",
    "No. A market liquidating faster than its usual pace is a reason to look closer, not a prediction. The one signal Hoax acts on is your own account's health, because that is the number the liquidation engine acts on.",
  ],
  [
    "How is protection different from a stop-loss?",
    "A stop-loss throws you out of the trade at a price you picked in advance. Hoax watches health, not price, so it also catches funding and losses on your other positions, and it closes only the slice it needs. You keep most of the position.",
  ],
  [
    "Can Hoax move my funds?",
    "No. The link grants placeOrderFor and nothing else: no withdrawals, no transfers, and it cannot cancel your own orders. Every fill settles to your account. You can unlink it from Settings, or in dreamDEX, with one transaction.",
  ],
  [
    "What does it cost?",
    "Radar and the API are free. Protection has no subscription: a close costs what the book charges for it, and a builder fee is added only if you approved one on chain.",
  ],
];

const PERSONAS = [
  {
    k: "Swing traders",
    title: "Sleep through the wick.",
    text: "Link once, set a trigger and a target, and let Hoax keep your health above the line overnight. It trims the smallest slice that restores your target, and only when that is cheaper than liquidation.",
    out: "A position that survives the night",
    href: "/start",
    cta: "Get protected",
  },
  {
    k: "Researchers and posters",
    title: "See who got liquidated, and why.",
    text: "Every liquidation on dreamDEX gets its own card: the legs the engine closed, the price it got, the keeper reward and what the trader lost. Share it with one click.",
    out: "A source-backed liquidation card",
    href: "/radar",
    cta: "Open the Radar",
  },
  {
    k: "Builders",
    title: "Build on a public record.",
    text: "Radar's snapshot, every protection receipt and the track record are public JSON. Re-check a receipt's signature yourself, or feed the liquidation stream into your own tools.",
    out: "Data you can verify",
    href: "https://github.com/linoxbt/Hoax#public-api",
    cta: "Read the API",
  },
];

const signalLine = (s: RadarSignal) => `${s.ratio.toFixed(1)}× its 7-day pace · ${NET_SHORT[s.chainId]?.replace("Somnia ", "")}`;

function costOf(snap: RadarSnapshot, chainId: number, notional: number) {
  const p = snap.params[chainId];
  return p ? (notional * (p.penaltyBps + p.minSpreadBps)) / 10_000 : 0;
}

export default async function Landing() {
  // The track record and the featured receipt are one part of the page: without the database the rest still renders.
  const data = await getStore()
    .then(async (store) => {
      // Asked for by outcome: skipped attempts can far outnumber closes and push a save out of any recent window.
      const [stats, savedRows] = await Promise.all([store.stats(), store.listActions({ outcome: "saved", limit: 1 })]);
      const saved = savedRows[0] ?? null;
      const cf = saved ? await store.getCounterfactual(saved.id) : null;
      return { stats, saved, cf };
    })
    .catch((err) => {
      console.error("track record unavailable:", err instanceof Error ? err.message : String(err));
      return null;
    });
  // Radar: public indexer data, so it renders even without the database.
  const radar = await radarSignals([...RADAR_CHAINS]).catch((err) => {
    console.error("radar unavailable:", err instanceof Error ? err.message : String(err));
    return null;
  });
  const stats = data?.stats ?? null;
  const saved = data?.saved ?? null;
  const sample = DEMO ? " · sample" : "";

  const day = radar?.day ?? null;
  // A market counts as a signal at 1.5× its own 7-day pace, as on Radar.
  const focus = radar?.signals.find((s) => s.ratio >= 1.5) ?? null;
  const lost = day ? day.totals.penalty + day.totals.spreadFloor : 0;
  const top = day?.markets ?? [];
  const share = (n: number) => (day && day.totals.notional > 0 ? Math.round((n / day.totals.notional) * 100) : 0);
  const donut = top.slice(0, 2).map((m) => ({ label: base(m.symbol), pct: share(m.notional) }));
  const otherPct = Math.max(0, 100 - donut.reduce((s, d) => s + d.pct, 0));
  const labels = day ? timeLabels(day.series, 3, hhmm) : [];
  const latest = day?.items[0] ?? null;
  const biggest = day?.items.reduce<(typeof day.items)[number] | null>((b, l) => (!b || l.notional > b.notional ? l : b), null) ?? null;
  const ratioBy = new Map((radar?.signals ?? []).map((s) => [`${s.chainId}:${s.symbol}`, s.ratio]));
  const explorer: ExplorerMarket[] = day
    ? top.slice(0, 4).map((m) => ({
        key: `${m.chainId}-${m.symbol}`,
        base: base(m.symbol),
        net: NET_SHORT[m.chainId]?.replace("Somnia ", "") ?? "",
        values: m.series,
        labels: timeLabels(day.series, 3, (t) => `${hhmm(t)} UTC`),
        count: m.count,
        notional: compact(m.notional),
        cost: usdso(costOf(day, m.chainId, m.notional)),
        ratio: ratioBy.get(`${m.chainId}:${m.symbol}`) ?? null,
      }))
    : [];

  return (
    <>
      {/* hero */}
      <section className="hh bleed">
        <div className="hh-in">
          <div className="hh-copy">
            <Eyebrow>Market intelligence for dreamDEX perps</Eyebrow>
            <h1 className="hh-title">
              From billions of trades to <span className="hl">one clear signal.</span>
            </h1>
            <p className="lede" data-reveal>
              Hoax reads every liquidation on dreamDEX as it happens and turns a crowded market into the signal that matters for your position.
              When yours turns, Hoax acts before the engine does.
            </p>
            <div className="row hh-cta" data-reveal>
              <Btn href="/radar" fill>
                Find your signal
              </Btn>
              <Btn href="/start">Protect a position</Btn>
            </div>
            <p className="mono-s soft" data-reveal>
              Live data from Somnia Tokyo and Shannon. Your keys, your positions.
            </p>
            <div className="hh-feats" data-reveal>
              <span>Liquidation radar</span>
              <span>Market signals</span>
              <span>Account health</span>
              <span>Protection</span>
            </div>
          </div>

          <div className="hh-stage" aria-label="Live market overview">
            <div className="card hh-main">
              <div className="between">
                <span className="h5">Market overview</span>
                <span className="eyebrow soft">Live data</span>
              </div>
              <div className="hh-kpis">
                <div>
                  <span>Liquidations, 24 h</span>
                  <b>{day ? day.totals.count.toLocaleString("en-US") : "–"}</b>
                </div>
                <div>
                  <span>Notional closed</span>
                  <b>{day ? compact(day.totals.notional) : "–"}</b>
                </div>
                <div>
                  <span>Markets hit</span>
                  <b>{day ? day.markets.length : "–"}</b>
                </div>
              </div>
              <span className="mono-s ink">Liquidation activity</span>
              {day && <AreaChart id="hero" values={day.series.map((b) => b.notional)} labels={labels} height={150} guides={2} />}
            </div>

            <div className="card hh-focus">
              <span className="eyebrow">Signal in focus</span>
              {focus ? (
                <>
                  <span className="h4">{base(focus.symbol)} is unwinding.</span>
                  <span className="mono-s soft">{signalLine(focus)}</span>
                  <div className="bar-track">
                    <i style={{ width: `${Math.min(100, (focus.ratio / Math.max(2, focus.ratio)) * 100)}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <span className="h4">A calm market.</span>
                  <span className="mono-s soft">No market is running above its pace</span>
                </>
              )}
            </div>

            <div className="card hh-glance">
              <span className="h5">Where it happens, at a glance</span>
              <div className="row" style={{ gap: "1.8rem", flexWrap: "nowrap" }}>
                <svg viewBox="0 0 42 42" width="64" height="64" aria-hidden>
                  <circle cx="21" cy="21" r="15.9" fill="none" stroke="#e8f0ff" strokeWidth="6" />
                  {
                    donut.reduce<{ off: number; el: React.ReactNode[] }>(
                      (acc, d, i) => {
                        acc.el.push(
                          <circle
                            key={d.label}
                            cx="21"
                            cy="21"
                            r="15.9"
                            fill="none"
                            stroke={i === 0 ? "#1954f5" : "#8db7ff"}
                            strokeWidth="6"
                            strokeDasharray={`${d.pct} ${100 - d.pct}`}
                            strokeDashoffset={25 - acc.off}
                          />,
                        );
                        acc.off += d.pct;
                        return acc;
                      },
                      { off: 0, el: [] },
                    ).el
                  }
                </svg>
                <div className="hh-legend">
                  {donut.map((d) => (
                    <span key={d.label}>
                      {d.label} {d.pct}%
                    </span>
                  ))}
                  {day && <span>Other {otherPct}%</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* before you trade */}
      <section className="sp hs-day g-aside">
        <div className="stack" style={{ gap: "2.4rem" }}>
          <Eyebrow>08:45 / Before you trade</Eyebrow>
          <Split className="h2">Open the market. Not twenty tabs.</Split>
          <p className="txt" data-reveal>
            One live view of who is getting liquidated, where, and how fast. Watch the pieces come together before you size your next position.
          </p>
          <div data-reveal>
            <Btn href="/radar">Open the Radar</Btn>
          </div>
        </div>
        <div className="hs-frame" data-reveal>
          <div className="card hs-brief">
            <span className="eyebrow">Your daily signal / live edition</span>
            <span className="h4">Today on dreamDEX.</span>
            <div className="hs-list">
              {latest && (
                <div>
                  <b>{hhmm(latest.time)}</b>
                  <span>
                    Latest: a {latest.legs[0].side} on {base(latest.legs[0].symbol)}, {compact(latest.notional)} USDso closed
                  </span>
                </div>
              )}
              {biggest && (
                <div>
                  <b>{hhmm(biggest.time)}</b>
                  <span>
                    Biggest: {compact(biggest.notional)} USDso of {base(biggest.legs[0].symbol)} in one liquidation
                  </span>
                </div>
              )}
              {day && (
                <div>
                  <b>24 h</b>
                  <span>
                    {day.totals.accounts} accounts liquidated, at least {compact(lost)} USDso lost
                  </span>
                </div>
              )}
              {!day && (
                <div>
                  <b>–</b>
                  <span>The markets indexer did not answer. Open the Radar to retry.</span>
                </div>
              )}
            </div>
            <span className="mono-s soft">{day ? `${day.markets.length} markets · Somnia Tokyo and Shannon` : "Somnia Tokyo and Shannon"}</span>
          </div>
          <div className="blueblock hs-notice">
            <span className="cap">01 / Notice the change</span>
            <span className="h5">{focus ? `${base(focus.symbol)} is outside its usual range.` : "Every market is inside its usual range."}</span>
            <p>
              {focus
                ? `${focus.count} liquidations today against ${focus.baseline.toFixed(1)} a day this week. A starting point, not a verdict.`
                : "A quiet tape is a starting point too. Check your own health before you add size."}
            </p>
          </div>
          <div className="dark hs-question">
            <span className="cap">02 / Keep the question</span>
            <span className="h5">How close is my own position to the same fate?</span>
          </div>
        </div>
      </section>

      {/* signal explorer */}
      <section className="sp">
        <div className="shead">
          <Eyebrow>01 / A clearer perspective</Eyebrow>
          <Split className="h2">A signal is the beginning. Not the conclusion.</Split>
          <p className="txt" data-reveal>
            Switch markets to explore a day of liquidations. See the activity, read the context, and decide what deserves your attention. Every
            observation is a prompt to look closer, not an instruction to trade.
          </p>
        </div>
        <div data-reveal>
          {explorer.length > 0 ? (
            <SignalExplorer markets={explorer} />
          ) : (
            <div className="card">
              <p className="txt">The markets indexer did not answer. The explorer fills in as soon as it does.</p>
            </div>
          )}
        </div>
        <div className="hq" data-reveal>
          <span className="h5">What should I check next?</span>
          <p className="txt">
            Whether your own account holds this market, how far its health is from 1.0, and what a trim would cost on today&apos;s book. Hoax keeps
            that question answered every second for the positions you protect.
          </p>
        </div>
      </section>

      {/* from signal to action */}
      <section className="band tint bleed hband">
        <div className="g-aside">
          <div className="stack" style={{ gap: "2.4rem" }}>
            <Eyebrow>02 / From signal to action</Eyebrow>
            <Split className="h2">The signal is only half the story.</Split>
            <p className="txt" data-reveal>
              A signal tells you what changed. Hoax checks what acting would cost on the live book, acts only when that is cheaper than the
              liquidation, and signs a receipt for what it did.
            </p>
            <div data-reveal>
              <Btn href="/how-it-works" fill>
                Explore our method
              </Btn>
            </div>
          </div>
          <div data-reveal>
            <Brief />
          </div>
        </div>
      </section>

      {/* follow the thread */}
      <section className="sp">
        <div className="shead">
          <Eyebrow>13:30 / Follow the thread</Eyebrow>
          <Split className="h2">Keep the why. Not just the what.</Split>
          <p className="txt" data-reveal>
            A fill tells you what happened. A Hoax receipt tells you why it was sent, what it cost and whether it mattered, signed by your
            account&apos;s key and judged 24 hours later.
          </p>
        </div>
        <div className="grid g2 ht" data-reveal>
          <div className="card stack" style={{ gap: "2rem" }}>
            <Eyebrow>The observation</Eyebrow>
            <span className="h4">Health is the signal that liquidates you.</span>
            <p className="txt">
              Price, funding and every other position in the account move one number: equity over maintenance margin. At 1.0 the engine takes
              over. Hoax watches that number, not a price you guessed in advance.
            </p>
            <div className="panel ht-figure">
              <span className="eyebrow ink">Account / health after one trim</span>
              <span className="h3 hl">1.18 → 1.60</span>
              <span className="mono-s soft">Shannon · SOL-PERP · receipt 69bdf902</span>
            </div>
            <div>
              <Btn href="/how-it-works">Understand the method</Btn>
            </div>
          </div>
          {saved ? (
            <Link className="dark ht-receipt" href={`/r/${saved.id}`}>
              <span className="eyebrow">
                Your receipt / {saved.market}
                {sample}
              </span>
              <span className="h4">Saved. Equity preserved, up to {data?.cf?.preserved != null ? `${usd(data.cf.preserved)} USDso` : "–"}.</span>
              <div className="ht-rows">
                <div>
                  <span>Health</span>
                  <b>
                    {saved.healthBefore.toFixed(2)} → {saved.healthAfter != null ? saved.healthAfter.toFixed(2) : "–"}
                  </b>
                </div>
                <div>
                  <span>Close cost</span>
                  <b>{closeCost(saved.cost, 3)}</b>
                </div>
                <div>
                  <span>Liquidation would cost</span>
                  <b>{saved.estLiqCost != null ? `${usd(saved.estLiqCost)} USDso` : "–"}</b>
                </div>
                <div>
                  <span>Network</span>
                  <b>{(saved.receipt.chainId && NETWORK_NAMES[saved.receipt.chainId]) || "dreamDEX"}</b>
                </div>
              </div>
              <span className="eyebrow soft">Next check / open the signed receipt →</span>
            </Link>
          ) : (
            <div className="dark ht-receipt">
              <span className="eyebrow">Your receipt</span>
              <span className="h4">No close has been judged saved yet.</span>
              <p className="txt">Every receipt appears on the track record the moment it is signed, and is judged 24 hours later.</p>
              <Link className="eyebrow soft" href="/stats">
                Next check / see the track record →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* settings */}
      <section className="sp g-aside hs-set">
        <div className="panel hs-settings" data-reveal>
          <span className="eyebrow">Your protection settings</span>
          <div>
            <span className="h4">Trigger 1.25</span>
            <p className="mono-s soft">Hoax acts once health slips clearly below it.</p>
          </div>
          <div className="panel-in">
            <span className="h4">Target 1.60</span>
            <p className="mono-s soft">Restored with the smallest close that gets there</p>
          </div>
          <div>
            <span className="h4">Max slippage: 0.3%</span>
            <p className="mono-s soft">A trim the book cannot fill inside it is skipped, and you are told why.</p>
          </div>
        </div>
        <div className="stack" style={{ gap: "2.4rem" }}>
          <Eyebrow>Built around your risk</Eyebrow>
          <Split className="h2">Stay protected. Stay in control.</Split>
          <p className="txt" data-reveal>
            Set the trigger, the target, the slippage you accept and the most Hoax may close at once, for each market. Defaults are shown here.
          </p>
          <p className="txt" data-reveal>
            The link grants one call, placing orders for your account, and nothing else: no withdrawals, no transfers. Pause a market or unlink
            everything in one transaction.
          </p>
          <div data-reveal>
            <Btn href="/security">See what the key can do</Btn>
          </div>
        </div>
      </section>

      {/* built in the open */}
      <section className="band navy bleed hn">
        <div className="g-aside">
          <div className="hn-board" data-reveal>
            <div className="between">
              <span className="eyebrow">Track record{sample}</span>
              <span className="eyebrow soft">Public</span>
            </div>
            <div className="hn-stats">
              {(
                [
                  ["Saves", stats ? String(stats.saves) : "–"],
                  ["Closes filled", stats ? String(stats.actionsTaken) : "–"],
                  ["Saved equity, up to", stats ? `${usd(stats.savedEquity)}` : "–"],
                  ["Misses", stats ? String(stats.misses) : "–"],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            <p className="mono-s soft">Every close, skip and miss is public and signed. Saved equity is an upper bound, in USDso.</p>
          </div>
          <div className="stack" style={{ gap: "2.4rem" }}>
            <Eyebrow tone="white">Built in the open</Eyebrow>
            <h2 className="h1">Your edge isn&apos;t another alert. It&apos;s the exit you didn&apos;t need.</h2>
            <p className="txt">Open source, on testnet, with every receipt public. Read the code, re-check a signature, or call the API.</p>
            <div>
              <Btn href="/stats" white>
                See the track record
              </Btn>
            </div>
          </div>
        </div>
      </section>

      {/* personas */}
      <section className="sp">
        <div className="shead">
          <Eyebrow>Different desks. One engine.</Eyebrow>
          <Split className="h2">One signal. Your way of trading.</Split>
          <p className="txt" data-reveal>
            Whether you hold one leveraged position or study the whole market, start with the workflow that fits your day.
          </p>
        </div>
        <div className="hp">
          {PERSONAS.map((p, i) => (
            <div className="card hp-card" key={p.k} style={{ ["--i" as string]: i }}>
              <div className="stack hp-text">
                <Eyebrow>{p.k}</Eyebrow>
                <span className="h2">{p.title}</span>
                <p className="txt">{p.text}</p>
                <span className="eyebrow ink">Your output / {p.out}</span>
                <div>
                  <Btn href={p.href} external={p.href.startsWith("http")}>
                    {p.cta}
                  </Btn>
                </div>
              </div>
              <div className="panel hp-vis">
                {i === 0 && (
                  <>
                    <span className="h4">My positions / 2 markets</span>
                    <div className="hp-stack">
                      <div className="panel-in hp-tilt">
                        <span className="eyebrow">ETH-PERP · health 1.42</span>
                        <span className="mono-s soft">Comfortably above the trigger</span>
                      </div>
                      <div className="blueblock hp-over">
                        <span className="cap">Trim sent</span>
                        <span className="h5">0.8 SOL closed. Health back to 1.60.</span>
                      </div>
                    </div>
                    <div className="panel-in">
                      <span className="eyebrow">The next good question</span>
                      <p className="ink">SOL-PERP: health 1.60, trigger 1.25. ETH-PERP: comfortable. Nothing to do.</p>
                    </div>
                    <span className="eyebrow soft">Illustrative workspace / sample data</span>
                  </>
                )}
                {i === 1 && (
                  <>
                    <span className="h4">Liquidation card / {focus ? base(focus.symbol) : "BTC"}</span>
                    <div className="panel-in">
                      <span className="eyebrow">What the engine took</span>
                      <div className="hp-bars">
                        <i style={{ height: "100%" }} />
                        <i style={{ height: "46%", background: "var(--bad)" }} />
                        <i style={{ height: "24%", background: "var(--blue-300)" }} />
                      </div>
                      <div className="hp-bar-l mono-s soft">
                        <span>Notional</span>
                        <span>Penalty</span>
                        <span>Spread</span>
                      </div>
                    </div>
                    <div className="panel-in">
                      <span className="eyebrow">The next good question</span>
                      <p className="ink">One whale or a cascade? Compare it with the market&apos;s 7-day pace before you share it.</p>
                    </div>
                    <span className="eyebrow soft">Illustrative workspace</span>
                  </>
                )}
                {i === 2 && (
                  <>
                    <span className="h4">Public API / JSON</span>
                    <div className="dark hp-code">
                      <code>GET /api/radar?chain=all&amp;hours=24</code>
                      <code>GET /api/actions?owner=0x…</code>
                      <code>GET /api/actions/&lt;id&gt;</code>
                      <code>GET /api/stats</code>
                    </div>
                    <div className="panel-in">
                      <span className="eyebrow">The next good question</span>
                      <p className="ink">Does the receipt&apos;s signature recover to the account&apos;s Hoax key? Check it yourself.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div data-reveal style={{ marginTop: "4rem" }}>
          <Btn href="/start" fill>
            Walk through protection
          </Btn>
        </div>
      </section>

      {/* what it costs */}
      <section className="band white bleed hband">
        <div className="shead">
          <Eyebrow>Room to grow</Eyebrow>
          <Split className="h2">Free to watch. Fair to protect.</Split>
          <p className="txt" data-reveal>
            The Radar and the API cost nothing. Protection has no subscription: you pay what the book charges for a close, when a close is worth it.
          </p>
        </div>
        <div className="grid g3 hc" data-reveal>
          {(
            [
              ["Watch the market", "Radar", "Free", "no wallet needed", "/radar", "Open the Radar", ["Every liquidation, live", "Both networks, 24 h and 7 days", "A share card for each one", "Signals against each market's pace"], "Nothing to sign up for"],
              ["Protect a position", "Protection", "$0", "subscription · pay per close", "/start", "Get protected", ["Health read every second", "Smallest close that restores your target", "Acts only when cheaper than liquidation", "Signed receipt for every action"], "Builder fee only if you approve one"],
              ["Build on it", "API", "Free", "public JSON", "https://github.com/linoxbt/Hoax#public-api", "Read the API", ["Radar snapshot", "Every receipt, with signature checks", "The track record", "Open source, Apache-2.0"], "Rate-limited"],
            ] as const
          ).map(([k, name, price, per, href, cta, list, foot], i) => (
            <div key={name} className={i === 1 ? "panel hc-card" : "card hc-card"}>
              <span className="eyebrow">{k}</span>
              <span className="h4">{name}</span>
              <div className="stack" style={{ gap: "0.6rem" }}>
                <span className="hc-price">{price}</span>
                <span className="mono-s soft">{per}</span>
              </div>
              <Link className="btn sm" href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                {cta}
                <Arrow dir={href.startsWith("http") ? "ne" : "e"} />
              </Link>
              <span className="eyebrow">What&apos;s included</span>
              <ul>
                {list.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <span className="mono-s soft hc-foot">{foot}</span>
            </div>
          ))}
        </div>
      </section>

      {/* faq */}
      <section className="sp g-aside hf">
        <div className="stack" style={{ gap: "2.4rem", alignSelf: "start" }}>
          <Eyebrow>A little more clarity</Eyebrow>
          <Split className="h2">Good questions. Clear answers.</Split>
          <p className="txt" data-reveal>
            What a signal means, where the data comes from, and what Hoax can and cannot do with your account.
          </p>
          <div data-reveal>
            <Btn href="/security">Read the security notes</Btn>
          </div>
        </div>
        <div data-reveal>
          <Accordion items={FAQ} />
        </div>
      </section>
    </>
  );
}
