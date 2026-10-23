import Link from "next/link";
import { Bars, Edge, TickMark } from "@/components/Bars";
import { Kicker, Marquee } from "@/components/Kicker";
import { OutcomeBadge } from "@/components/Outcome";
import { StatsGrid } from "@/components/StatsGrid";
import { getStore } from "@/lib/server";
import { health, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const store = await getStore();
  const [stats, recent] = await Promise.all([store.stats(), store.listActions({ limit: 50 })]);
  const example = recent.find((a) => a.outcome === "saved") ?? recent.find((a) => a.txHash) ?? null;
  const cf = example ? await store.getCounterfactual(example.id) : null;

  return (
    <>
      {/* ---- hero ---- */}
      <section className="sec char">
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
                <div className="num m">
                  <small style={{ marginLeft: 0, marginRight: 6 }}>dodge</small>1%
                </div>
                <div className="cap soft" style={{ marginTop: 10 }}>
                  liquidation penalty,
                  <br />
                  plus the forced close
                </div>
              </div>
              <div>
                <div className="num m">0</div>
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
          <div style={{ color: "var(--sand)", opacity: 0.9 }}>
            <Bars n={240} shape="story" seed={5} height={300} label="Illustration: health falling toward liquidation, restored twice by small closes" />
          </div>
          <div className="wrap" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", paddingBottom: 28 }}>
            <div className="spread" style={{ width: "100%" }}>
              <h1 className="h2" style={{ color: "var(--paper)", maxWidth: 560, textShadow: "0 1px 18px rgba(0,0,0,0.5)" }}>
                The cheaper exit from a losing perp
              </h1>
              <Link href="/start" className="ring" style={{ background: "var(--char)" }}>
                Protect my positions
              </Link>
            </div>
          </div>
        </div>

        <div className="wrap pad-s">
          <div className="grid g4 cap">
            <div>
              <div className="soft">Network</div>Somnia Tokyo testnet
            </div>
            <div>
              <div className="soft">Execution</div>placeOrderFor · IOC only
            </div>
            <div>
              <div className="soft">Custody</div>trade-only linked key
            </div>
            <div>
              <div className="soft">Proof</div>signed receipt per action
            </div>
          </div>
        </div>
      </section>

      {/* ---- prologue ---- */}
      <section className="sec sand">
        <Edge color="char" seed={4} />
        <div className="wrap pad" style={{ paddingTop: 48 }}>
          <Kicker>Prologue</Kicker>
          <p className="quote">
            «Liquidation is the worst exit in perps. Hoax closes the smallest slice that brings your health back, only
            when that costs less than the liquidation it prevents, and signs a receipt for every move.»
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: 36 }}>
            <Link href="/replay" className="pill">
              Watch the replay
            </Link>
            <Link href="/stats" className="pill ghost">
              See the record
            </Link>
          </div>
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section className="sec sand">
        <div className="wrap pad" style={{ paddingTop: 24 }}>
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <h2>
                How it
                <br />
                works
              </h2>
              <p className="copy soft" style={{ marginTop: 24 }}>
                Health is equity over maintenance margin. At 1.0 the liquidation engine takes over. Hoax acts first, and
                only as much as it must.
              </p>
            </div>
            <ol className="steps">
              <li>
                <span className="n">01</span>
                <div>
                  <h3>Link</h3>
                  <p className="copy">Hoax makes a key just for your wallet. You add it in dreamDEX with Link a bot, Perps ticked. It can trade, never withdraw.</p>
                </div>
              </li>
              <li>
                <span className="n">02</span>
                <div>
                  <h3>Watch</h3>
                  <p className="copy">Every second, and the moment a position changes, Hoax reads your health. It never acts on a mark the pool calls stale.</p>
                </div>
              </li>
              <li>
                <span className="n">03</span>
                <div>
                  <h3>Cut</h3>
                  <p className="copy">At your trigger it sizes the smallest close that restores your target and sends it only if it costs less than half a liquidation.</p>
                </div>
              </li>
              <li>
                <span className="n">04</span>
                <div>
                  <h3>Prove</h3>
                  <p className="copy">Every action leaves a signed receipt. For 24 hours Hoax watches whether the close was needed, and says so either way.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* ---- the record ---- */}
      <section className="sec char">
        <Edge color="sand" seed={9} />
        <div className="wrap" style={{ paddingTop: 32 }}>
          <Marquee text="The record" />
        </div>
        <div className="wrap pad" style={{ paddingTop: 48 }}>
          <StatsGrid stats={stats} />
          <p className="cap soft" style={{ marginTop: 28, maxWidth: 720 }}>
            A close counts as saved only if, within 24 hours, the mark reached the liquidation price the position had before
            the close and the reduced position survived. Otherwise its cost is shown as the price of insurance.
          </p>
        </div>
      </section>

      {/* ---- the formula ---- */}
      <section className="sec char">
        <div className="wrap pad" style={{ paddingTop: 0 }}>
          <div className="grid g2" style={{ gap: 48, alignItems: "end" }}>
            <div>
              <Kicker left>Sizing</Kicker>
              <div className="display" style={{ fontSize: "clamp(30px, 4.2vw, 58px)", lineHeight: 1.05, letterSpacing: "-0.02em", textTransform: "none" }}>
                n = (H<sub style={{ fontSize: "0.45em" }}>t</sub>·M − E) / (H<sub style={{ fontSize: "0.45em" }}>t</sub>·m − c)
              </div>
              <p className="copy soft" style={{ marginTop: 20 }}>
                The notional to close: target health, maintenance requirement, equity, the market&apos;s maintenance rate and
                the close&apos;s own cost, read from the live book. Rounded to the lot, capped per step.
              </p>
            </div>
            <div className="vline">
              <Kicker left>Cost gate</Kicker>
              <div className="display" style={{ fontSize: "clamp(30px, 4.2vw, 58px)", lineHeight: 1.05, letterSpacing: "-0.02em", textTransform: "none" }}>
                C<sub style={{ fontSize: "0.45em" }}>close</sub> ≤ λ · C<sub style={{ fontSize: "0.45em" }}>liq</sub>
              </div>
              <p className="copy soft" style={{ marginTop: 20 }}>
                Liquidation costs the engine&apos;s 1% penalty plus a forced close at no less than its 50 bps spread. Hoax acts
                only when its close costs at most half of that.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- a receipt ---- */}
      {example && (
        <section className="sec sand">
          <Edge color="char" seed={12} />
          <div className="wrap pad" style={{ paddingTop: 48 }}>
            <div className="grid g-aside" style={{ gap: 48, alignItems: "start" }}>
              <div>
                <Kicker left>A receipt</Kicker>
                <h2>
                  Every save
                  <br />
                  is provable
                </h2>
                <p className="copy soft" style={{ marginTop: 24 }}>
                  Signed by the account&apos;s Hoax key. Every field re-derives from the transaction and the reads at its block.
                </p>
                <div className="row" style={{ marginTop: 24 }}>
                  <Link href={`/r/${example.id}`} className="pill">
                    Open the receipt
                  </Link>
                </div>
              </div>
              <Link href={`/r/${example.id}`} className="panel" style={{ display: "block", textDecoration: "none" }}>
                <div className="spread" style={{ marginBottom: 16 }}>
                  <span className="h3">
                    {example.market} {example.side}
                  </span>
                  <OutcomeBadge outcome={example.outcome} />
                </div>
                <div className="rows">
                  <div className="r">
                    <span>Health</span>
                    <span>
                      {health(example.healthBefore)} → {health(example.healthAfter)}
                    </span>
                  </div>
                  <div className="r">
                    <span>Close cost</span>
                    <span>{usd(example.cost)} USDso</span>
                  </div>
                  <div className="r">
                    <span>Liquidation would cost</span>
                    <span>{usd(example.estLiqCost)} USDso</span>
                  </div>
                  {cf?.preserved != null && (
                    <div className="r">
                      <span>Equity preserved</span>
                      <span>{usd(cf.preserved)} USDso</span>
                    </div>
                  )}
                </div>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ---- close ---- */}
      <section className="sec char">
        {example && <Edge color="sand" seed={2} />}
        <div className="wrap pad" style={{ textAlign: "center" }}>
          <TickMark />
          <h2 style={{ marginTop: 24 }}>
            Two minutes
            <br />
            to protected
          </h2>
          <div className="row" style={{ justifyContent: "center", marginTop: 40 }}>
            <Link href="/start" className="ring">
              Protect my positions
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
