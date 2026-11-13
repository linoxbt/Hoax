import { PageHead, SectionHead } from "@/components/Kicker";
import { Btn, Eyebrow, Split } from "@/components/Ui";

export const metadata = { title: "Security" };

const GRANT: Array<[string, string, boolean]> = [
  ["placeOrderFor", "Immediate-or-cancel closes", true],
  ["cancelOrderFor", "Cancel its own orders", true],
  ["reduceOrderFor", "Reduce its own orders", true],
  ["Withdraw · transfer", "Not granted: the link carries only the three order selectors", false],
  ["Spot pools", "Not granted: per-pool grants on perp pools only", false],
];

const THREATS: Array<[string, string]> = [
  ["Key compromise", "Trade-only scope. One key per account. Revoked in one transaction."],
  ["Hijacked link", "The link batch only executes from the Safe's own owner; anyone else reverts (GS025)."],
  ["Over-closing", "Fresh size, per-step cap, IOC only, post-fill reconcile."],
  ["Position flip", "Flattened immediately; account paused."],
  ["Bad data", "Fails closed on stale marks and read errors."],
  ["Fee abuse", "On-chain approval only, pool-capped at 10 bps."],
  ["Receipt tampering", "Signed by the Hoax key; re-derivable from chain."],
  ["Gas drain", "Linked keys only, per-key and daily caps."],
];

const KEYS: Array<[string, string]> = [
  ["Keys", "AES-256-GCM, one per account, held by the engine and never in the database."],
  ["Control", "Activation needs a transaction only your wallet can send to your own dreamDEX account."],
  ["Off switch", "Pause in Settings. Revoke from Settings or from dreamDEX, instantly."],
];

export default function Security() {
  const can = GRANT.filter((g) => g[2]);
  const cannot = GRANT.filter((g) => !g[2]);
  return (
    <>
      <PageHead
        kicker="Security"
        title="Trades. Never withdraws."
        sub={
          <>
            The worst Hoax can do is trade badly, never move your funds. Every control on this page limits <b>a bad trade</b>.
          </>
        }
        actions={[
          { href: "/start", label: "Get protected" },
          { href: "https://github.com/linoxbt/Hoax", label: "Read the code", ink: true, external: true },
        ]}
      />

      {/* the link: what the key can and cannot do */}
      <section className="pg-sec-first">
        <div className="shead split">
          <div className="stack" style={{ gap: "2rem" }}>
            <Eyebrow>01 / The link</Eyebrow>
            <Split className="h2" delay={0.05}>
              One transaction. Less than dreamDEX asks.
            </Split>
          </div>
          <p className="txt" data-reveal>
            dreamDEX&apos;s own Link a bot adds a registry-wide grant. For a dreamDEX Safe, Hoax grants per perp pool only, from your wallet to your Safe.
            Verified on a fork of Hideki: 21 pools linked in one transaction, revoked in one, and refused from anyone but the owner. A wallet that trades
            without a Safe gets the same registry-wide grant Link a bot gives, and the link step says so before you sign.
          </p>
        </div>
        <div className="pg-two">
          <div className="card pg-grant" data-reveal>
            <Eyebrow>What the Hoax key can do</Eyebrow>
            <div className="h3">Three order selectors.</div>
            <ul className="pg-glist">
              {can.map(([fn, what]) => (
                <li key={fn}>
                  <i className="yes" aria-label="granted">
                    ✓
                  </i>
                  <span>
                    <b className="mono">{fn}</b>
                    <small>{what}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="dark pg-grant" data-reveal style={{ ["--d" as string]: "0.08s" }}>
            <Eyebrow>What it cannot do</Eyebrow>
            <div className="h3">Move your funds.</div>
            <ul className="pg-glist">
              {cannot.map(([fn, what]) => (
                <li key={fn}>
                  <i className="no" aria-label="not granted">
                    ×
                  </i>
                  <span>
                    <b className="mono">{fn}</b>
                    <small>{what}</small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="pg-grant-foot">Pause in Settings. Revoke from Settings or from dreamDEX, instantly.</p>
          </div>
        </div>
      </section>

      {/* threat model, as FAQ-style rows */}
      <section className="sp pg-faq">
        <div className="pg-faq-head">
          <Eyebrow>02 / Threat model</Eyebrow>
          <Split className="h2" delay={0.05}>
            What could go wrong
          </Split>
          <p className="txt" data-reveal>
            Each threat, and the control that limits it.
          </p>
          <div data-reveal>
            <Btn href="https://github.com/linoxbt/Hoax" external>
              Read the code
            </Btn>
          </div>
        </div>
        <ol className="pg-faq-rows">
          {THREATS.map(([t, c], i) => (
            <li key={t} data-reveal style={{ ["--d" as string]: `${(i % 4) * 0.04}s` }}>
              <span className="pg-faq-n">{String(i + 1).padStart(2, "0")}</span>
              <b>{t}</b>
              <p>{c}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* keys and control, in a pale-blue frame */}
      <section className="sp">
        <SectionHead label="03 / Keys and control" title="Your wallet stays in charge" />
        <div className="panel pg-keys">
          {KEYS.map(([t, d], i) => (
            <div key={t} className="panel-in" data-reveal style={{ ["--d" as string]: `${i * 0.06}s` }}>
              <span className="eyebrow">{t}</span>
              <p className="h5 ink">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
