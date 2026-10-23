import { PageHead, SectionHead } from "@/components/Kicker";
import { Btn } from "@/components/Ui";

export const metadata = { title: "How it works" };

const STEPS: Array<[string, string, string]> = [
  ["Link", "One transaction", "Your wallet grants a dedicated Hoax key trade-only rights on every perp pool, through your own dreamDEX account. Nothing else."],
  ["Watch", "Every second", "The engine reads account health each second and on every position event. A stale mark or a failed read means no order."],
  ["Size", "The smallest slice", "At the trigger it solves for the close that restores your target, rounds to the lot and caps it per step."],
  ["Gate", "Cheaper or nothing", "It sends only if closing costs at most half of what liquidation would, read from the penalty and the live book."],
  ["Prove", "Signed, then judged", "Every action gets a signed receipt. For 24 hours the mark is tracked: saved, or the cost was insurance."],
];

const GUARDS: Array<[string, string]> = [
  ["Fresh size", "Never larger than the position read just before sending."],
  ["IOC only", "Immediate-or-cancel. Nothing rests on the book to fill later."],
  ["Reconcile", "A flipped position is flattened at once and the account paused."],
  ["Fail closed", "Stale marks, read errors and halted markets mean no order."],
];

export default function HowItWorks() {
  return (
    <>
      <PageHead
        kicker="Product"
        title="Act first. Act small."
        sub={
          <>
            Health is equity over maintenance margin. At 1.0 the venue liquidates. Hoax acts at your trigger and closes only enough to restore your
            target, <b>when that is cheaper</b>.
          </>
        }
        actions={[
          { href: "/start", label: "Get protected" },
          { href: "/replay", label: "Watch the replay", ink: true },
        ]}
      />

      <section className="sec">
        <SectionHead label="Mechanism" title="Five steps, one loop" sub="The same loop runs for every protected account, every second, on all 21 dreamDEX perp markets." />
        <div className="cells bt steps5">
          {STEPS.map(([t, k, d], i) => (
            <div key={t} className="step" data-reveal style={{ ["--d" as string]: `${i * 0.06}s` }}>
              <div className="prob-item-head between">
                <span className="mono-s ink">{k}</span>
                <span className="mono-s muted">[{String(i + 1).padStart(2, "0")}]</span>
              </div>
              <div className="step-body">
                <div className="h4">{t}</div>
                <p className="txt" style={{ marginTop: "1.6rem" }}>
                  {d}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sec cells c2">
        <div className="p formula-cell">
          <div className="mono-s ink">Sizing</div>
          <div className="formula">
            n = (H<sub>t</sub>·M − E) / (H<sub>t</sub>·m − c)
          </div>
          <p className="txt">
            E is equity, M the account&apos;s maintenance requirement, m the market&apos;s maintenance rate and c the close&apos;s cost per unit of notional,
            read from the live book. Cross-margin aware; rounded to the lot and capped per step.
          </p>
        </div>
        <div className="p formula-cell">
          <div className="mono-s ink">Cost gate</div>
          <div className="formula">
            C<sub>close</sub> ≤ λ · C<sub>liq</sub>
          </div>
          <p className="txt">
            C<sub>liq</sub> is the LiquidationEngine&apos;s 100 bps penalty plus a forced close at no better than its 50 bps minimum spread. λ defaults to
            0.5: Hoax acts only when the trim costs at most half of the liquidation it prevents.
          </p>
        </div>
      </section>

      <section className="sec">
        <SectionHead label="Flip guard" title="No reduce-only flag, so four guards" sub="dreamDEX perp orders cannot be marked reduce-only. An oversized close would open the opposite position. Hoax never lets it." />
        <div className="cells c4 bt">
          {GUARDS.map(([t, d], i) => (
            <div key={t} className="p" data-reveal style={{ ["--d" as string]: `${i * 0.06}s`, minHeight: "16rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div className="mono-s muted">[{String(i + 1).padStart(2, "0")}]</div>
              <div>
                <div className="h5">{t}</div>
                <p className="txt" style={{ marginTop: "1.2rem" }}>
                  {d}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sec cta-main" style={{ borderTop: "var(--b) solid var(--line)" }}>
        <h2 className="h2">The details are on chain</h2>
        <p className="txt">Read the security model, or watch two identical positions go through the same crash.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: "3.2rem" }}>
          <Btn href="/security">Security model</Btn>
          <Btn href="/replay" fill>
            Watch the replay
          </Btn>
        </div>
      </section>
    </>
  );
}
