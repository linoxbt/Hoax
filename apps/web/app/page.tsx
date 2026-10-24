import { ArtBlind, ArtBlunt, ArtCases, ArtCostly, ArtForced, ArtTower } from "@/components/home/Art";
import { BuildUp } from "@/components/home/BuildUp";
import { Accordion } from "@/components/home/Accordion";
import { HeroLive } from "@/components/home/HeroLive";
import { MarketStrip } from "@/components/home/MarketStrip";
import { ScrollText } from "@/components/ScrollText";
import { LiveSimulator } from "@/components/Simulator";
import { Btn, CornerLink, Label, Split } from "@/components/Ui";
import { usd } from "@/lib/format";
import { getStore } from "@/lib/server";

export const dynamic = "force-dynamic";

const WORK = ["Fewer liquidations", "Smaller exits", "Signed receipts", "No custody", "Every market", "Second by second"];

const PROBLEMS: Array<{ tag: string; title: string; text: string; Art: () => React.JSX.Element }> = [
  { tag: "Forced", title: "The engine picks your exit", text: "Below maintenance the liquidation engine closes for you, at a spread you never agreed to.", Art: ArtForced },
  { tag: "Blind", title: "Health moves while you sleep", text: "Mark price and hourly funding move health on a position you are not watching.", Art: ArtBlind },
  { tag: "Blunt", title: "Stop-losses close everything", text: "A stop exits the whole position at one price, even when a slice would have done.", Art: ArtBlunt },
  { tag: "Costly", title: "A penalty on the way out", text: "Liquidation takes a 100 bps penalty plus the forced-close spread, out of your equity.", Art: ArtCostly },
];

const PLATFORM: Array<{ n: string; title: string; text: string; href: string; mock: React.ReactNode }> = [
  {
    n: "01",
    title: "Protection engine",
    text: "A watcher that reads every protected account each second, decides with a cost gate, and closes through your linked key with immediate-or-cancel orders only.",
    href: "/how-it-works",
    mock: <EngineMock />,
  },
  {
    n: "02",
    title: "Signed receipts",
    text: "Every action writes a receipt anyone can check: health before and after, size, fill, cost, and the liquidation it avoided, signed by the key that acted.",
    href: "/stats",
    mock: <ReceiptMock />,
  },
  {
    n: "03",
    title: "Your dashboard",
    text: "Connect the wallet you trade with. Hoax finds your dreamDEX account, shows each position against its trigger and target, and links in one transaction.",
    href: "/start",
    mock: <DashMock />,
  },
];

const WHY: Array<{ k: string; text: string; side: "l" | "r" }> = [
  { k: "Watch", text: "Hoax reads health every second, and on every position event", side: "l" },
  { k: "Decide", text: "It acts only when a close costs less than the liquidation it prevents", side: "r" },
  { k: "Trim", text: "It closes the smallest slice that restores your target, then reconciles", side: "l" },
];

const CASES: Array<[string, string]> = [
  ["Swing traders", "Hold a leveraged view for days without watching the screen overnight."],
  ["Market makers", "Keep inventory hedges alive through spikes without full stop-outs."],
  ["Funds and desks", "Per-account policies, signed receipts and a public track record for reporting."],
  ["Trading bots", "A second line of defence that does not depend on your bot staying up."],
  ["Part-time traders", "Set a policy once; Hoax trims while you work, sleep or travel."],
  ["High-leverage traders", "The closer you run to maintenance, the more a timely slice is worth."],
];

export default async function Landing() {
  const store = await getStore();
  const stats = await store.stats();

  return (
    <>
      {/* hero: the drawing, then title, description and the corner link */}
      <section className="sec first">
        <HeroLive />
        <div className="cells c-hero bt">
          <div className="hero-title">
            <Split as="h1" className="h1">
              Exit before the liquidation engine does
            </Split>
          </div>
          <div className="stack">
            <p className="txt ink p-s grow" style={{ padding: "1.6rem" }} data-reveal>
              Hoax watches your leveraged dreamDEX perps and trims them back to safe health the moment they slip, only when that is cheaper than
              liquidation, with a signed receipt for <b>every action</b>.
            </p>
            <div className="bt marquee hero-work" aria-label="What Hoax brings">
              {[0, 1].map((n) => (
                <div className="marquee-track" key={n} aria-hidden={n === 1}>
                  {WORK.map((w) => (
                    <span key={w} className="mono-s soft work-item">
                      <i />
                      {w}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <CornerLink href="/start">Get protected</CornerLink>
        </div>
      </section>

      {/* intro: the tower drawing beside the statement, and the live markets */}
      <section className="sec cells c2">
        <div className="drawing intro-art">
          <ArtTower />
        </div>
        <div className="stack">
          <div className="intro-copy grow">
            <ScrollText
              className="h3"
              text="Liquidation is the worst exit in perps. Hoax closes a small slice first, so you keep the trade, keep the equity and keep the choice."
            />
            <div style={{ marginTop: "3.2rem" }} data-reveal>
              <Btn href="/how-it-works">Learn more</Btn>
            </div>
          </div>
          <MarketStrip />
        </div>
      </section>

      {/* problems */}
      <section className="sec">
        <div className="between prob-head">
          <div>
            <Label>Problems</Label>
            <Split className="h2" delay={0.05}>
              Liquidation takes more than it needs
            </Split>
          </div>
          <p className="txt prob-sub" data-reveal>
            Perp venues protect themselves, not you. When an account slips under maintenance, the engine sells into the book on its terms, and the trader
            pays for it.
          </p>
        </div>
        <div className="cells c4 bt">
          {PROBLEMS.map((p, i) => (
            <div key={p.tag} className="prob-item">
              <div className="prob-item-head between">
                <span className="mono-s ink row" style={{ gap: "0.8rem" }}>
                  {i === 2 && <span className="dotsq" />}
                  {p.tag}
                </span>
                <span className="mono-s muted">[{String(i + 1).padStart(2, "0")}]</span>
              </div>
              <div className="prob-item-img">
                <p.Art />
              </div>
              <div className="prob-item-body">
                <div className="h5" style={{ maxWidth: "24rem" }}>
                  {p.title}
                </div>
                <p className="txt" style={{ marginTop: "1.6rem" }}>
                  {p.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <BuildUp />

      {/* platform */}
      {PLATFORM.map((p) => (
        <section key={p.n} className="sec cells c-plat plat">
          <div className="plat-left">
            <div className="mono-s muted">[{p.n}]</div>
            <div className="h4" style={{ marginTop: "2.4rem" }}>
              {p.title}
            </div>
          </div>
          <div className="plat-img drawing">
            <span className="plus tl" aria-hidden />
            <span className="plus br" aria-hidden />
            <div data-reveal>{p.mock}</div>
          </div>
          <div className="stack">
            <p className="txt p grow">{p.text}</p>
            <div className="bt">
              <CornerLink href={p.href} ink>
                Learn more
              </CornerLink>
            </div>
          </div>
        </section>
      ))}

      {/* why: built to act while you are away */}
      <section className="sec">
        <div className="cells c-why">
          <div className="p" style={{ paddingTop: "6.4rem" }}>
            <Label>Why Hoax</Label>
            <Split className="h2" delay={0.05}>
              Built to act while you are away
            </Split>
          </div>
          <div className="stack" style={{ justifyContent: "flex-end" }}>
            <div className="p">
              <p className="txt">
                Hoax fits around how you trade instead of replacing it. It stays quiet while health is fine, acts only when a close is cheaper than the
                alternative, and leaves every decision on the record.
              </p>
              <div className="mono-xs muted" style={{ marginTop: "1.6rem" }}>
                [Scroll to continue]
              </div>
            </div>
          </div>
        </div>
        <div className="why-rows bt">
          {WHY.map((w, i) => (
            <div key={w.k} className={`why-row ${w.side}`}>
              <div className="why-bar" data-reveal>
                <span className="why-k">{w.k}</span>
                <span className="why-t">{w.text}</span>
                <i className="why-dot" />
              </div>
              <span className="why-line" data-draw style={{ ["--d" as string]: "0.3s" }} />
              <span className="why-pt" />
              <span className="mono-xs muted why-n">[{String(i + 1).padStart(2, "0")}]</span>
            </div>
          ))}
        </div>
      </section>

      {/* try it */}
      <section className="sec">
        <div className="between prob-head">
          <div>
            <Label>Try it</Label>
            <Split className="h2" delay={0.05}>
              Run a crash
            </Split>
          </div>
          <p className="txt prob-sub" data-reveal>
            The engine&apos;s own sizing function, in your browser, from ETH&apos;s live mark. Liquidation follows the venue model in the replay.
          </p>
        </div>
        <div className="bt">
          <LiveSimulator />
        </div>
      </section>

      {/* use cases */}
      <section className="sec cells c2">
        <div className="drawing cases-art">
          <ArtCases />
        </div>
        <div className="stack">
          <div className="cases-head">
            <Label>Use cases</Label>
            <Split className="h2" delay={0.05}>
              Made for every leveraged trader
            </Split>
          </div>
          <Accordion items={CASES} />
        </div>
      </section>

      {/* track record */}
      <section className="sec cells c4 record">
        {(
          [
            ["Saved equity", `${usd(stats.savedEquity)}`, "USDso"],
            ["Insurance cost", `${usd(stats.insuranceCost)}`, "USDso"],
            ["Actions taken", String(stats.actionsTaken), ""],
            ["Accounts protected", String(stats.accountsProtected), ""],
          ] as const
        ).map(([k, v, u], i) => (
          <div key={k} className="p" data-reveal style={{ ["--d" as string]: `${i * 0.06}s` }}>
            <div className="mono-s soft">{k}</div>
            <div className="num m" style={{ marginTop: "2.4rem" }}>
              {v}
              {u && <small>{u}</small>}
            </div>
          </div>
        ))}
      </section>

      {/* call to action */}
      <section className="sec cta">
        <div className="cells c4 cta-coords">
          {["[0,246]", "[831,0]", "[2303,0]", "[0,544]"].map((c) => (
            <div key={c} className="mono-xs muted">
              {c}
            </div>
          ))}
        </div>
        <div className="cta-main">
          <Split className="h2" delay={0.05}>
            See what Hoax does for your positions
          </Split>
          <p className="txt" style={{ marginTop: "1.6rem" }} data-reveal>
            Connect the wallet you trade with. Linking takes one transaction and you can revoke it with another.
          </p>
          <div style={{ marginTop: "3.2rem" }} data-reveal>
            <Btn href="/start" fill>
              Get protected
            </Btn>
          </div>
        </div>
      </section>
    </>
  );
}

function EngineMock() {
  const rows = [
    ["31,168,812", "3.07", "watch"],
    ["31,168,826", "2.41", "watch"],
    ["31,168,840", "1.23", "act"],
    ["31,168,841", "1.60", "receipt"],
  ];
  return (
    <div className="mock tagbox" style={{ width: "100%" }}>
      <div className="tagbox-head between">
        <span>Engine · BTC-PERP</span>
        <span>1 tick / s</span>
      </div>
      <div className="mock-rows">
        {rows.map(([b, h, s]) => (
          <div key={b} className={`mock-row${s === "act" ? " act" : ""}`}>
            <span>#{b}</span>
            <span>H {h}</span>
            <span>{s === "act" ? "Trim 0.0537 BTC" : s === "receipt" ? "Signed" : "Watch"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReceiptMock() {
  return (
    <div className="mock tagbox" style={{ width: "100%" }}>
      <div className="tagbox-head between">
        <span>Receipt · saved</span>
        <span>✓ Verified</span>
      </div>
      <div className="mock-rows">
        {[
          ["Health", "1.23 → 1.60"],
          ["Closed", "0.0537 BTC"],
          ["Avg fill", "81,679"],
          ["Liq. cost avoided", "132.37 USDso"],
          ["Signed by", "0x8ae6…b3eC"],
        ].map(([k, v]) => (
          <div key={k} className="mock-row">
            <span>{k}</span>
            <span />
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashMock() {
  const pos = [
    ["BTC-PERP", 0.36],
    ["ETH-PERP", 0.62],
    ["SOL-PERP", 0.18],
  ] as const;
  return (
    <div className="mock tagbox" style={{ width: "100%" }}>
      <div className="tagbox-head between">
        <span>Positions</span>
        <span>21 / 21 linked</span>
      </div>
      <div className="mock-rows">
        {pos.map(([m, k]) => (
          <div key={m} className="mock-row bar">
            <span>{m}</span>
            <span className="mock-meter">
              <i style={{ width: `${k * 100}%` }} />
              <b style={{ left: "30%" }} />
              <b className="t" style={{ left: "55%" }} />
            </span>
            <span>{(1 + k * 3).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
