import Link from "next/link";
import { Bars, Edge } from "@/components/Bars";
import { Kicker } from "@/components/Kicker";
import { StatsGrid } from "@/components/StatsGrid";
import { getStore } from "@/lib/server";

export const dynamic = "force-dynamic";

const FEATURES: Array<[string, string, string]> = [
  ["/start", "Protect positions", "Link a trade-only Hoax key to your dreamDEX wallet and set a policy in five short steps."],
  ["/app", "Your positions", "Live health for every position, with the trigger and target Hoax works to."],
  ["/how-it-works", "How it works", "The sizing formula, the cost gate and the flip guard behind every close."],
  ["/security", "Security", "What a Hoax key can and cannot do, and every control that limits a bad trade."],
  ["/stats", "The record", "Saved equity beside the price of insurance, misses included."],
  ["/replay", "Replay", "Two identical accounts through the same crash: one protected, one not."],
];

export default async function Landing() {
  const store = await getStore();
  const stats = await store.stats();

  return (
    <>
      <section className="sec">
        <div className="wrap" style={{ paddingTop: 56 }}>
          <div className="spread">
            <div>
              <div className="cap soft">Automatic partial deleveraging · dreamDEX perps</div>
              <div className="striate xl" style={{ marginTop: 12 }}>
                Hoax
              </div>
            </div>
            <div className="grid g2" style={{ gap: 40, paddingBottom: 18 }}>
              <div>
                <div className="num m accent">
                  <small style={{ marginLeft: 0, marginRight: 6 }}>dodge</small>1%
                </div>
                <div className="cap soft" style={{ marginTop: 10 }}>
                  liquidation penalty,
                  <br />
                  plus the forced close
                </div>
              </div>
              <div>
                <div className="num m accent">0</div>
                <div className="cap soft" style={{ marginTop: 10 }}>
                  withdrawals a hoax key
                  <br />
                  can ever make
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 32 }}>
          <div style={{ color: "var(--indigo)", opacity: 0.16 }}>
            <Bars n={240} shape="story" seed={5} height={300} label="Illustration: health falling toward liquidation, restored twice by small closes" />
          </div>
          <div className="wrap" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", paddingBottom: 28 }}>
            <div className="spread" style={{ width: "100%" }}>
              <h1 className="h2" style={{ maxWidth: 600 }}>
                The cheaper exit from a <span className="accent">losing perp</span>
              </h1>
              <Link href="/start" className="ring" style={{ background: "var(--white)" }}>
                Protect my positions
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="sec alt">
        <Edge seed={4} opacity={0.5} />
        <div className="wrap pad" style={{ paddingTop: 48 }}>
          <Kicker center>Prologue</Kicker>
          <p className="quote">
            «Liquidation is the worst exit in perps. Hoax closes the smallest slice that brings your health back, only when
            that costs less than the liquidation it prevents, and signs a receipt for <span className="accent">every move</span>.»
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap pad">
          <Kicker>Everything Hoax does</Kicker>
          <h2 style={{ marginBottom: 40 }}>One page per feature</h2>
          <div className="grid g3">
            {FEATURES.map(([href, title, text], i) => (
              <Link key={href} href={href} className="card">
                <div className="cap accent">{String(i + 1).padStart(2, "0")}</div>
                <h3 style={{ margin: "14px 0 10px" }}>{title}</h3>
                <p className="copy soft">{text}</p>
                <div className="go" style={{ marginTop: 18 }}>
                  Open →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec alt">
        <div className="wrap pad">
          <div className="spread" style={{ marginBottom: 32 }}>
            <div>
              <Kicker>The record</Kicker>
              <h2>Saved, paid, missed</h2>
            </div>
            <Link href="/stats" className="pill ghost">
              Full record
            </Link>
          </div>
          <StatsGrid stats={stats} />
        </div>
      </section>
    </>
  );
}
