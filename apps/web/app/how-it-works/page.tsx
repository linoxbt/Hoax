import Link from "next/link";
import { Edge } from "@/components/Bars";
import { Kicker, PageHead } from "@/components/Kicker";

const formula = { fontSize: "clamp(28px, 4vw, 54px)", lineHeight: 1.05, letterSpacing: "-0.02em", textTransform: "none" as const };
const sub = { fontSize: "0.45em" };

export default function HowItWorks() {
  return (
    <>
      <PageHead kicker="How it works" title={<>Act first,<br />only as much<br />as it must</>}>
        <p className="copy soft" style={{ maxWidth: 420 }}>
          Health is equity over maintenance margin. At 1.0 dreamDEX&apos;s liquidation engine takes over. Hoax acts before
          that, with the smallest close that brings your health back to your target.
        </p>
      </PageHead>

      <section className="sec alt">
        <Edge seed={31} opacity={0.5} />
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <ol className="steps">
            <li>
              <span className="n">01</span>
              <div>
                <h3>Link</h3>
                <p className="copy">Hoax makes a key just for your wallet. You add it in dreamDEX with Link a bot, Perps ticked. It can place, cancel and reduce orders for that wallet, and nothing else.</p>
              </div>
            </li>
            <li>
              <span className="n">02</span>
              <div>
                <h3>Watch</h3>
                <p className="copy">Every second, and the moment a position changes or is liquidated, Hoax reads your health. It never acts on a mark the pool calls stale, or after a read that failed.</p>
              </div>
            </li>
            <li>
              <span className="n">03</span>
              <div>
                <h3>Size and gate</h3>
                <p className="copy">At your trigger it sizes the close that restores your target, then checks it against what liquidation would cost. Only a clearly cheaper close goes out.</p>
              </div>
            </li>
            <li>
              <span className="n">04</span>
              <div>
                <h3>Close</h3>
                <p className="copy">One immediate-or-cancel placeOrderFor, sized from a fresh read and priced inside your max slippage. Nothing is left resting on the book.</p>
              </div>
            </li>
            <li>
              <span className="n">05</span>
              <div>
                <h3>Prove</h3>
                <p className="copy">A receipt signed by your Hoax key. For 24 hours Hoax watches whether the close was needed, and says so either way.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="sec">
        <div className="wrap pad">
          <div className="grid g2" style={{ gap: 48 }}>
            <div>
              <Kicker>Sizing</Kicker>
              <div className="display accent" style={formula}>
                n = (H<sub style={sub}>t</sub>·M − E) / (H<sub style={sub}>t</sub>·m − c)
              </div>
              <p className="copy soft" style={{ marginTop: 20 }}>
                n is the notional to close. Hₜ is your target health, M the account&apos;s maintenance requirement, E its
                equity, m the market&apos;s maintenance rate and c the close&apos;s own cost per unit, read from the live book.
                Margin is cross, so M counts every market you hold. The size is rounded up to the lot, raised to the market
                minimum, and capped at your max close per step.
              </p>
            </div>
            <div className="vline">
              <Kicker>Cost gate</Kicker>
              <div className="display accent" style={formula}>
                C<sub style={sub}>close</sub> ≤ λ · C<sub style={sub}>liq</sub>
              </div>
              <p className="copy soft" style={{ marginTop: 20 }}>
                Liquidation costs the engine&apos;s 1% penalty on the position plus a forced close at no less than its 50 bps
                spread, sized against today&apos;s book. With λ = 0.5, Hoax only closes when that costs at most half as much.
                Both numbers go on the receipt.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec alt">
        <div className="wrap pad">
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <Kicker>Flip guard</Kicker>
              <h2>Never on the wrong side</h2>
            </div>
            <div className="rows">
              <div className="r text">
                <span>Fresh size</span>
                <span>The close is never larger than the position read just before sending.</span>
              </div>
              <div className="r text">
                <span>IOC only</span>
                <span>No remainder rests on the book to fill later against a changed position.</span>
              </div>
              <div className="r text">
                <span>Reconcile</span>
                <span>After every fill Hoax re-reads the position. If another trade flipped it, Hoax flattens the flip at once and pauses the account.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap pad">
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <Kicker>Counterfactual</Kicker>
              <h2>Saved, or insurance</h2>
            </div>
            <div>
              <p className="copy" style={{ maxWidth: "none" }}>
                A close counts as saved only if, within 24 hours, the mark reaches the liquidation price the position had
                before the close and the reduced position survives. Equity preserved is the equity held at that moment, minus
                what would have been left after a liquidation there. If the mark never gets there, the close cost is shown as
                the price of insurance.
              </p>
              <div className="row" style={{ marginTop: 28 }}>
                <Link href="/stats" className="pill">
                  See the record
                </Link>
                <Link href="/replay" className="pill ghost">
                  Watch the replay
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
