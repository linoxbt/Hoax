import { Edge } from "@/components/Bars";
import { Kicker, PageHead } from "@/components/Kicker";

const THREATS: Array<[string, string]> = [
  ["Key compromise", "Trade-only scope. One key per wallet. Revoked by unlinking."],
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
                ["Control", "Activation requires your own link in dreamDEX."],
                ["Off switch", "Pause in Settings. Unlink to revoke instantly."],
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
