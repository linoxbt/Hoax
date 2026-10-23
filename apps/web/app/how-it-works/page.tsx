import Link from "next/link";
import { Edge } from "@/components/Bars";
import { Kicker, PageHead } from "@/components/Kicker";

const formula = { fontSize: "clamp(28px, 4vw, 54px)", lineHeight: 1.05, letterSpacing: "-0.02em", textTransform: "none" as const };
const sub = { fontSize: "0.45em" };

const STEPS: Array<[string, string]> = [
  ["Link", "A dedicated key per wallet, added via dreamDEX Link a bot. Trade-only."],
  ["Watch", "Health read every second and on every position event. Stale data is ignored."],
  ["Size", "The smallest close that restores your target health."],
  ["Gate", "Sent only if it costs at most half of a liquidation."],
  ["Prove", "Signed receipt. 24-hour check: saved, or insurance."],
];

export default function HowItWorks() {
  return (
    <>
      <PageHead kicker="Mechanism" title={<>Act first.<br />Act small.</>}>
        <p className="lede" style={{ maxWidth: 420 }}>
          Health = equity ÷ maintenance margin. At 1.0 the venue liquidates. Hoax acts before that.
        </p>
      </PageHead>

      <section className="sec alt">
        <Edge seed={31} opacity={0.45} />
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <ol className="steps">
            {STEPS.map(([t, d], i) => (
              <li key={t} data-reveal style={{ ["--d" as string]: `${i * 0.06}s` }}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{t}</h3>
                  <p className="copy">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec">
        <div className="wrap pad">
          <div className="grid g2" style={{ gap: 48 }}>
            <div data-reveal>
              <Kicker>Sizing</Kicker>
              <div className="display accent" style={formula}>
                n = (H<sub style={sub}>t</sub>·M − E) / (H<sub style={sub}>t</sub>·m − c)
              </div>
              <p className="copy" style={{ marginTop: 20 }}>
                Cross-margin aware. Cost c read from the live book. Rounded to the lot, capped per step.
              </p>
            </div>
            <div className="vline" data-reveal style={{ ["--d" as string]: "0.1s" }}>
              <Kicker>Cost gate</Kicker>
              <div className="display accent" style={formula}>
                C<sub style={sub}>close</sub> ≤ λ · C<sub style={sub}>liq</sub>
              </div>
              <p className="copy" style={{ marginTop: 20 }}>
                Liquidation = 1% penalty + forced close at ≥50 bps. Default λ = 0.5.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec alt">
        <div className="wrap pad">
          <div className="grid g3">
            {(
              [
                ["Fresh size", "Never larger than the position read just before sending."],
                ["IOC only", "Nothing rests on the book."],
                ["Reconcile", "A flipped position is flattened at once, then paused."],
              ] as const
            ).map(([t, d], i) => (
              <div key={t} className="card" data-reveal style={{ ["--d" as string]: `${i * 0.08}s` }}>
                <div className="cap accent">Flip guard · {String(i + 1).padStart(2, "0")}</div>
                <h3 style={{ margin: "12px 0 8px" }}>{t}</h3>
                <p className="copy">{d}</p>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 40 }}>
            <Link href="/security" className="pill">
              Security model
            </Link>
            <Link href="/replay" className="pill ghost">
              Watch the replay
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
