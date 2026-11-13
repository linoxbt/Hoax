/* pages */
import { DEFAULT_POLICY } from "@hoax/core";
import { PageHead, SectionHead } from "@/components/Kicker";
import { Btn, Eyebrow, Split } from "@/components/Ui";
import { GateBrief } from "./GateBrief";

export const metadata = { title: "How it works" };

const GUARDS: Array<[string, string]> = [
  ["Fresh size", "Never larger than the position read just before sending."],
  ["IOC only", "Immediate-or-cancel. Nothing rests on the book to fill later."],
  ["Reconcile", "A flipped position is flattened at once and the account paused."],
  ["Fail closed", "Stale marks, read errors and halted markets mean no order."],
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

const P = DEFAULT_POLICY;
// Where a health value sits on the illustrative scale (0.8 to 2.0).
const at = (h: number) => `${((h - 0.8) / 1.2) * 100}%`;

function Step({ n, label, title, tone = "", flip = false, children, visual }: { n: number; label: string; title: string; tone?: "" | "white" | "navy" | "tint"; flip?: boolean; children: React.ReactNode; visual: React.ReactNode }) {
  const num = String(n).padStart(2, "0");
  return (
    <section className={`pg-band bleed${tone ? ` ${tone}` : ""}`}>
      <div className={`pg-step${flip ? " flip" : ""}`}>
        <div className="pg-step-text">
          <div className="pg-step-num" aria-hidden>
            {num}
          </div>
          <div className="pg-step-copy">
            <Eyebrow>
              The method / {num} · {label}
            </Eyebrow>
            <Split className="h2">{title}</Split>
            <div className="txt" data-reveal>
              {children}
            </div>
          </div>
        </div>
        <div className="pg-step-vis" data-reveal style={{ ["--d" as string]: "0.1s" }}>
          {visual}
        </div>
      </div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <>
      <PageHead
        kicker="The method"
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

      <div className="pg-loopline">
        <span className="eyebrow">Five steps, one loop</span>
        <p className="txt">The same loop runs for every protected account, every second, on every dreamDEX perp market.</p>
      </div>

      {/* 01 link */}
      <Step
        n={1}
        label="One transaction"
        title="Link"
        tone="white"
        visual={
          <div className="panel pg-vis-link">
            <div className="pg-chain">
              <div className="panel-in">
                <span className="eyebrow">From</span>
                <div className="h5 ink">Your wallet</div>
                <p className="mono-xs soft">Signs one transaction</p>
              </div>
              <i aria-hidden />
              <div className="panel-in">
                <span className="eyebrow">Through</span>
                <div className="h5 ink">Your dreamDEX account</div>
                <p className="mono-xs soft">Funds stay here</p>
              </div>
              <i aria-hidden />
              <div className="panel-in">
                <span className="eyebrow">To</span>
                <div className="h5 ink">A dedicated Hoax key</div>
                <p className="mono-xs soft">Every perp pool</p>
              </div>
            </div>
            <div className="blueblock pg-float">
              <span className="cap">The grant</span>
              <div className="h5" style={{ marginTop: "0.8rem" }}>
                Trade-only rights. Nothing else.
              </div>
            </div>
          </div>
        }
      >
        Your wallet grants a dedicated Hoax key trade-only rights on every perp pool, through your own dreamDEX account. Nothing else.
      </Step>

      {/* 02 watch */}
      <Step
        n={2}
        label="Every second"
        title="Watch"
        tone="navy"
        visual={
          <div className="card pg-vis-health">
            <div className="between">
              <span className="eyebrow">Account health</span>
              <span className="mono-xs muted">ILLUSTRATIVE · DEFAULT POLICY</span>
            </div>
            <div className="h4" style={{ marginTop: "1.2rem" }}>
              Equity ÷ maintenance margin
            </div>
            <div className="pg-scale" aria-hidden>
              <div
                className="pg-scale-bar"
                style={{
                  background: `linear-gradient(90deg, var(--bad) 0 ${at(1)}, var(--warn-bg) ${at(1)} ${at(P.triggerHealth)}, var(--blue-100) ${at(P.triggerHealth)} ${at(P.targetHealth)}, var(--blue) ${at(P.targetHealth)} 100%)`,
                }}
              />
              {[
                [1, "Liquidation", "liq"],
                [P.triggerHealth, "Trigger", "trig"],
                [P.targetHealth, "Target", "tgt"],
              ].map(([h, l, c]) => (
                <div key={c as string} className={`pg-mark ${c}`} style={{ left: at(h as number) }}>
                  <b>{(h as number).toFixed(2)}</b>
                  <span>{l as string}</span>
                </div>
              ))}
            </div>
            <div className="pg-mini">
              <div className="panel-in">
                <span className="eyebrow">Reads</span>
                <p className="ink">Each second, and on every position event</p>
              </div>
              <div className="panel-in">
                <span className="eyebrow">Fails closed</span>
                <p className="ink">A stale mark or a failed read means no order</p>
              </div>
            </div>
          </div>
        }
      >
        The engine reads account health each second and on every position event. A stale mark or a failed read means no order.
      </Step>

      {/* 03 size */}
      <Step
        n={3}
        label="The smallest slice"
        title="Size"
        flip
        visual={
          <div className="card pg-formula">
            <div className="between">
              <span className="eyebrow">Sizing</span>
              <span className="mono-xs muted">Cross-margin aware</span>
            </div>
            <div className="pg-eq">
              n = (H<sub>t</sub>·M − E) / (H<sub>t</sub>·m − c)
            </div>
            <div className="pg-vars">
              <div>
                <b>E</b>
                <span>equity</span>
              </div>
              <div>
                <b>M</b>
                <span>the account&apos;s maintenance requirement</span>
              </div>
              <div>
                <b>m</b>
                <span>the market&apos;s maintenance rate</span>
              </div>
              <div>
                <b>c</b>
                <span>the close&apos;s cost per unit of notional, read from the live book</span>
              </div>
            </div>
            <p className="note">Rounded to the lot and capped per step.</p>
          </div>
        }
      >
        At the trigger it solves for the close that restores your target, rounds to the lot and caps it per step.
      </Step>

      {/* 04 gate */}
      <Step
        n={4}
        label="Cheaper or nothing"
        title="Gate"
        tone="white"
        visual={
          <GateBrief lambda={P.lambda} />
        }
      >
        It sends only if closing costs at most half of what liquidation would, read from the penalty and the live book.
      </Step>

      {/* 05 prove */}
      <Step
        n={5}
        label="Signed, then judged"
        title="Prove"
        tone="tint"
        flip
        visual={
          <div className="card pg-receipt">
            <div className="between">
              <span className="eyebrow">Receipt</span>
              <span className="mono-xs muted">SAMPLE</span>
            </div>
            <div className="h4" style={{ marginTop: "1.2rem" }}>
              Every action, signed
            </div>
            <div className="pg-receipt-steps">
              <div className="panel-in">
                <span className="mono-s ink">At the close</span>
                <span className="tag pending">signed receipt</span>
              </div>
              <div className="panel-in">
                <span className="mono-s ink">For 24 hours</span>
                <span className="tag pending">mark tracked</span>
              </div>
              <div className="panel-in">
                <span className="mono-s ink">Then judged</span>
                <span className="row" style={{ gap: "0.6rem" }}>
                  <span className="tag saved">saved</span>
                  <span className="tag not-needed">insurance</span>
                </span>
              </div>
            </div>
          </div>
        }
      >
        Every action gets a signed receipt. For 24 hours the mark is tracked: saved, or the cost was insurance.
      </Step>

      {/* flip guard */}
      <section className="sp">
        <SectionHead
          label="Flip guard"
          title="No reduce-only flag, so four guards"
          sub="dreamDEX perp orders cannot be marked reduce-only. An oversized close would open the opposite position. Hoax never lets it."
        />
        <div className="pg-guards">
          {GUARDS.map(([t, d], i) => (
            <div key={t} className="card pg-guard" data-reveal style={{ ["--d" as string]: `${i * 0.06}s` }}>
              <span className="eyebrow">Guard / {String(i + 1).padStart(2, "0")}</span>
              <div className="h4">{t}</div>
              <p className="txt">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* not a stop-loss */}
      <section className="sp">
        <SectionHead
          label="How it compares"
          title="Not a stop-loss."
          sub="A stop-loss decides when you leave the trade. Hoax decides how little to sell so the liquidation engine never gets your position."
        />
        <div className="pg-two">
          <Compare title="Stop-loss" sub="An exit you set and forget" rows={STOP} />
          <Compare title="Hoax" sub="Protection that keeps you in the trade" rows={HOAX} hoax />
        </div>
      </section>

      {/* close */}
      <section className="sp">
        <div className="card pg-cta">
          <div className="stack" style={{ gap: "1.6rem" }}>
            <Eyebrow>On chain / Read it yourself</Eyebrow>
            <h2 className="h2">The details are on chain</h2>
            <p className="txt">Read the security model, or watch two identical positions go through the same crash.</p>
          </div>
          <div className="row">
            <Btn href="/security">Security model</Btn>
            <Btn href="/replay" fill>
              Watch the replay
            </Btn>
          </div>
        </div>
      </section>
    </>
  );
}

function Compare({ title, sub, rows, hoax }: { title: string; sub: string; rows: Array<[string, string]>; hoax?: boolean }) {
  return (
    <div className={hoax ? "dark pg-cmp" : "card pg-cmp"} data-reveal>
      <span className="eyebrow">{hoax ? "Hoax / Protection" : "The usual exit"}</span>
      <div className="h3">{title}</div>
      <p className="txt">{sub}</p>
      <ul>
        {rows.map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </li>
        ))}
      </ul>
      {hoax && (
        <Btn href="/start" white>
          Get protected
        </Btn>
      )}
    </div>
  );
}
