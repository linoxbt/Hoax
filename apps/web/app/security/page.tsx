import { PageHead, SectionHead } from "@/components/Kicker";

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

      <section className="sec cells c2">
        <div className="p formula-cell">
          <div className="mono-s ink">The link</div>
          <div>
            <h2 className="h2">One transaction. Less than dreamDEX asks.</h2>
            <p className="txt" style={{ marginTop: "2.4rem", maxWidth: "52rem" }}>
              dreamDEX&apos;s own Link a bot adds a registry-wide grant. For a dreamDEX Safe, Hoax grants per perp pool only, from your wallet to your Safe.
              Verified on a fork of Hideki: 21 pools linked in one transaction, revoked in one, and refused from anyone but the owner. A wallet that
              trades without a Safe gets the same registry-wide grant Link a bot gives, and the link step says so before you sign.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div className="grants" style={{ margin: 0, border: 0, borderTop: "var(--b) solid var(--line)" }}>
            {GRANT.map(([fn, what, ok]) => (
              <div key={fn} className={ok ? "" : "no"}>
                <span className="dot">{ok ? "✓" : "×"}</span>
                <b className="mono" style={{ fontWeight: 500, fontSize: "1.4rem" }}>
                  {fn}
                </b>
                <small>{what}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <SectionHead label="Threat model" title="What could go wrong" sub="Each threat, and the control that limits it." />
        <div className="cells c4 bt threats">
          {THREATS.map(([t, c], i) => (
            <div key={t} className="p" data-reveal style={{ ["--d" as string]: `${(i % 4) * 0.05}s` }}>
              <div className="mono-s muted">[{String(i + 1).padStart(2, "0")}]</div>
              <div className="h5" style={{ marginTop: "3.2rem" }}>
                {t}
              </div>
              <p className="txt" style={{ marginTop: "1.2rem" }}>
                {c}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="sec cells c3">
        {KEYS.map(([t, d], i) => (
          <div key={t} className="p stat-cell" data-reveal style={{ ["--d" as string]: `${i * 0.06}s` }}>
            <div className="mono-s accent">{t}</div>
            <p className="h5" style={{ fontWeight: 600 }}>
              {d}
            </p>
          </div>
        ))}
      </section>
    </>
  );
}
