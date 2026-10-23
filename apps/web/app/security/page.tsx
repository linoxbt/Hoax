import Link from "next/link";
import { Edge } from "@/components/Bars";
import { Kicker, PageHead } from "@/components/Kicker";

const THREATS: Array<[string, string]> = [
  ["Hoax key stolen", "The key is trade-only: dreamDEX's Link a bot grants placeOrderFor, cancelOrderFor and reduceOrderFor, never a withdrawal. One key per wallet. Unlink the bot to revoke it. Fills are bounded by the venue's price band."],
  ["A bug closes too much", "Every close is sized from a fresh read, capped per step, sent IOC only, and reconciled after the fill."],
  ["A bug flips the position", "The flip guard flattens the flipped amount at once, then pauses the account until you confirm."],
  ["Acting on bad data", "Hoax fails closed: no order on a stale mark, after an RPC error or after an indexer error. Repeated read failures alert you."],
  ["Fee abuse", "The builder fee comes only from your on-chain approval, is capped by the pool at 10 bps, and is shown on every receipt. Paper USDso accounts are never charged."],
  ["Receipt tampering", "Each receipt hash is signed by your Hoax key, and every field can be re-derived from public chain data."],
  ["Gas wallet drained", "Gas drips only to keys with a confirmed link, under a per-key and a daily cap."],
];

export default function Security() {
  return (
    <>
      <PageHead kicker="Security and trust" title={<>It can trade.<br />It can never<br />withdraw.</>}>
        <p className="copy soft" style={{ maxWidth: 420 }}>
          The worst a Hoax key can do is trade badly. Every control below exists to limit a bad trade.
        </p>
      </PageHead>
      <section className="sec alt">
        <Edge seed={41} opacity={0.5} />
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <Kicker>Threats and controls</Kicker>
              <h2>Seven ways it could go wrong</h2>
            </div>
            <div className="rows">
              {THREATS.map(([t, c]) => (
                <div className="r text" key={t}>
                  <span>{t}</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap pad">
          <div className="grid g3">
            <div className="card">
              <div className="cap accent">Keys</div>
              <h3 style={{ margin: "12px 0 10px" }}>Encrypted, never shared</h3>
              <p className="copy soft">Each wallet gets its own key, stored AES-256-GCM encrypted in the watcher&apos;s keystore and never in the database.</p>
            </div>
            <div className="card">
              <div className="cap accent">Management</div>
              <h3 style={{ margin: "12px 0 10px" }}>Linking is the proof</h3>
              <p className="copy soft">A registration only becomes active when you link its key in dreamDEX, which nobody but you can do. Your manage token stays in your browser.</p>
            </div>
            <div className="card">
              <div className="cap accent">Off switch</div>
              <h3 style={{ margin: "12px 0 10px" }}>One click, or unlink</h3>
              <p className="copy soft">Pause Hoax from Settings. Unlinking the bot in dreamDEX revokes it completely, straight away.</p>
            </div>
          </div>
          <p className="cap soft" style={{ marginTop: 32 }}>
            Vulnerabilities found in dreamDEX contracts go privately to security@dreamdex.io. <Link href="/how-it-works" className="accent">How it works →</Link>
          </p>
        </div>
      </section>
    </>
  );
}
