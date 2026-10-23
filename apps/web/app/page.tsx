import Link from "next/link";
import { Bars, Edge } from "@/components/Bars";
import { CountUp } from "@/components/CountUp";
import { Kicker, Marquee } from "@/components/Kicker";
import { ScrollText } from "@/components/ScrollText";
import { StatsGrid } from "@/components/StatsGrid";
import { getStore } from "@/lib/server";

export const dynamic = "force-dynamic";

// Every figure here is sourced: the LiquidationEngine's 100 bps penalty and the
// 10 bps builder-fee cap are chain reads, 478 ms is spike 3's measured median,
// 21 is the live perp market count, and the replay numbers come from
// public/replay.json (demo/replay.ts).
const METRICS: Array<{ value: number; decimals?: number; prefix?: string; suffix?: string; label: string }> = [
  { value: 1, suffix: "%", label: "Liquidation penalty avoided" },
  { value: 478, suffix: " ms", label: "Median detection time" },
  { value: 0, label: "Funds in custody" },
  { value: 21, label: "Perp markets covered" },
];

const STEPS: Array<[string, string]> = [
  ["Link", "A trade-only key, added in dreamDEX in one step."],
  ["Watch", "Account health read every second."],
  ["Trim", "The smallest close that restores your target."],
];

const MODEL: Array<[string, string, string]> = [
  ["Non-custodial", "0", "withdrawal rights. The key can only trade."],
  ["Revenue", "≤10 bps", "builder fee on each protective close, approved on-chain by the trader."],
  ["Verifiable", "1:1", "every action has a signed, public receipt."],
];

export default async function Landing() {
  const store = await getStore();
  const stats = await store.stats();

  return (
    <>
      <section className="sec">
        <div className="wrap" style={{ paddingTop: 64 }}>
          <div className="cap accent hero-in" style={{ ["--d" as string]: "0.1s" }}>
            Liquidation protection · dreamDEX perps
          </div>
          <div className="striate xl intro" style={{ marginTop: 14 }}>
            Hoax
          </div>
          <div className="grid g-aside" style={{ marginTop: 40, alignItems: "end", gap: 40 }}>
            <h1 className="h2 hero-in" style={{ ["--d" as string]: "0.5s" }}>
              Exit before the <span className="accent">liquidation engine</span> does
            </h1>
            <div className="hero-in" style={{ ["--d" as string]: "0.7s" }}>
              <p className="lede">
                Hoax trims leveraged positions to safe size the moment health slips, only when that is cheaper than
                liquidation, with a signed receipt for every action.
              </p>
              <div className="row" style={{ marginTop: 24 }}>
                <Link href="/start" className="pill">
                  Get protected
                </Link>
                <Link href="/replay" className="pill ghost">
                  See it work
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="wrap" style={{ marginTop: 64 }}>
          <div className="grid g4" style={{ gap: 0 }}>
            {METRICS.map((m, i) => (
              <div key={m.label} data-reveal style={{ ["--d" as string]: `${i * 0.08}s`, padding: "24px 20px 24px 0", borderTop: "1px solid var(--line)", borderLeft: i % 4 ? "1px solid var(--line)" : undefined, paddingLeft: i % 4 ? 20 : 0 }}>
                <div className="num m accent">
                  <CountUp value={m.value} decimals={m.decimals} prefix={m.prefix} suffix={m.suffix} />
                </div>
                <div className="cap soft" style={{ marginTop: 12 }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ color: "var(--indigo)", opacity: 0.18, marginTop: 40 }} data-reveal="grow">
          <Bars n={240} shape="story" seed={5} height={220} label="Health over time: two slides toward liquidation, each stopped by a small close" />
        </div>
      </section>

      <section className="sec alt">
        <Edge seed={4} opacity={0.45} />
        <div className="wrap pad" style={{ paddingTop: 72, paddingBottom: 120 }}>
          <Kicker center>Thesis</Kicker>
          <ScrollText text="Liquidation is a forced sale at the worst possible price. Hoax makes it optional." accent={["optional"]} />
        </div>
      </section>

      <section className="sec">
        <div className="wrap pad">
          <div className="spread" style={{ marginBottom: 40 }}>
            <div>
              <Kicker>Product</Kicker>
              <h2>Three steps. Zero custody.</h2>
            </div>
            <Link href="/how-it-works" className="pill ghost">
              The mechanism
            </Link>
          </div>
          <div className="grid g3">
            {STEPS.map(([t, d], i) => (
              <div key={t} data-reveal style={{ ["--d" as string]: `${i * 0.1}s`, borderTop: "2px solid var(--indigo)", paddingTop: 20 }}>
                <div className="cap accent">{String(i + 1).padStart(2, "0")}</div>
                <h3 style={{ margin: "12px 0 8px" }}>{t}</h3>
                <p className="copy">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec deep">
        <div className="wrap pad">
          <div className="grid g-aside" style={{ gap: 48, alignItems: "end" }}>
            <div data-reveal>
              <Kicker>Proof</Kicker>
              <h2>Same crash. Two outcomes.</h2>
              <p className="lede" style={{ marginTop: 20, color: "var(--soft)" }}>
                Two identical 1 ETH positions through a 4.5% drop, on live dreamDEX parameters.
              </p>
              <Link href="/replay" className="pill" style={{ marginTop: 28 }}>
                Watch the replay
              </Link>
            </div>
            <div className="grid g2" style={{ gap: 0 }} data-reveal>
              <div style={{ paddingRight: 24 }}>
                <div className="cap soft">Unprotected</div>
                <div className="num m" style={{ marginTop: 10, opacity: 0.6 }}>
                  <CountUp value={59.45} decimals={2} />
                </div>
                <div className="cap soft" style={{ marginTop: 10 }}>
                  USDso · liquidated
                </div>
              </div>
              <div style={{ paddingLeft: 24, borderLeft: "1px solid var(--rule)" }}>
                <div className="cap" style={{ color: "#a5b4fc" }}>
                  With Hoax
                </div>
                <div className="num m" style={{ marginTop: 10, color: "#a5b4fc" }}>
                  <CountUp value={85.35} decimals={2} />
                </div>
                <div className="cap soft" style={{ marginTop: 10 }}>
                  USDso · survived · +43%
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap pad">
          <Kicker>Model</Kicker>
          <h2 style={{ marginBottom: 40 }}>Built to scale with the venue</h2>
          <div className="grid g3">
            {MODEL.map(([k, v, d], i) => (
              <div key={k} className="card" data-reveal style={{ ["--d" as string]: `${i * 0.1}s` }}>
                <div className="cap soft">{k}</div>
                <div className="num m accent" style={{ margin: "16px 0 12px" }}>
                  {v}
                </div>
                <p className="copy">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec alt">
        <div className="wrap" style={{ paddingTop: 56 }}>
          <Marquee text="Track record" />
        </div>
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <div data-reveal>
            <StatsGrid stats={stats} />
          </div>
          <div className="row" style={{ marginTop: 32 }}>
            <Link href="/stats" className="pill ghost">
              Full track record
            </Link>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap pad" style={{ textAlign: "center" }}>
          <h2 data-reveal>
            Protected in <span className="accent">two minutes</span>
          </h2>
          <div className="row" style={{ justifyContent: "center", marginTop: 36 }} data-reveal>
            <Link href="/start" className="ring">
              Get protected
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
