import { Edge } from "@/components/Bars";
import { Kicker, PageHead } from "@/components/Kicker";

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

export default function Security() {
  return (
    <>
      <PageHead kicker="Security" title={<>Trades.<br />Never withdraws.</>}>
        <p className="lede" style={{ maxWidth: 420 }}>
          The worst case is a bad trade, not lost funds. Every control limits that.
        </p>
      </PageHead>
      <section className="sec">
        <div className="wrap pad" style={{ paddingBottom: 40 }}>
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <Kicker>The link</Kicker>
              <h2>One transaction. Less than dreamDEX asks.</h2>
              <p className="copy soft" style={{ marginTop: 20, maxWidth: 440 }}>
                dreamDEX&apos;s own Link a bot adds a registry-wide grant. Hoax grants per perp pool only, from your wallet to your
                dreamDEX Safe, verified end to end on a fork of Hideki: 21 pools linked in one transaction, revoked in one.
              </p>
            </div>
            <div className="grants" style={{ marginTop: 0 }}>
              {GRANT.map(([fn, what, ok]) => (
                <div key={fn} className={ok ? "" : "no"}>
                  <span className="dot">{ok ? "✓" : "×"}</span>
                  <b className="mono" style={{ fontWeight: 500, fontSize: 13 }}>
                    {fn}
                  </b>
                  <small>{what}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="sec alt">
        <Edge seed={41} opacity={0.45} />
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <Kicker>Threat model</Kicker>
          <div className="rows">
            {THREATS.map(([t, c], i) => (
              <div className="r text" key={t} data-reveal style={{ ["--d" as string]: `${i * 0.05}s` }}>
                <span>{t}</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap pad">
          <div className="grid g3">
            {(
              [
                ["Keys", "AES-256-GCM, per wallet, never in the database."],
                ["Control", "Activation requires a transaction only your wallet can send."],
                ["Off switch", "Pause in Settings. Revoke from Settings or dreamDEX, instantly."],
              ] as const
            ).map(([t, d], i) => (
              <div key={t} className="card" data-reveal style={{ ["--d" as string]: `${i * 0.08}s` }}>
                <div className="cap accent">{t}</div>
                <p className="copy" style={{ marginTop: 12 }}>
                  {d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
