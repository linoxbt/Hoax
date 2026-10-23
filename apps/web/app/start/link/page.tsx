"use client";
// Step 2: add the Hoax key in dreamDEX with Link a bot.
import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { StepNav } from "@/components/StepNav";
import { DREAMDEX_APP, short } from "@/lib/format";
import { useStart } from "@/lib/startContext";

export default function LinkStep() {
  const { session, view, linked } = useStart();
  if (session === undefined) return null;
  if (!session)
    return (
      <p className="copy">
        Start with <Link href="/start" className="accent">step 01</Link>.
      </p>
    );
  const key = view?.account?.hoaxKey ?? null;

  return (
    <div className="grid g-aside" style={{ gap: 48 }}>
      <div>
        <h2>Link the Hoax key</h2>
        <p className="copy soft" style={{ marginTop: 20 }}>
          The key can place, cancel and reduce orders for this wallet in dreamDEX. It cannot withdraw or send funds, and every
          fill settles to your wallet.
        </p>
      </div>
      <div>
        <div className="panel">
          <div className="cap soft">Hoax key for {short(session.owner)}</div>
          {key ? (
            <div className="spread" style={{ marginTop: 8, alignItems: "center" }}>
              <code className="mono" style={{ fontSize: 15 }}>
                {key}
              </code>
              <CopyButton text={key} />
            </div>
          ) : (
            <p className="copy" style={{ marginTop: 8 }}>
              Making a key just for this wallet…
            </p>
          )}
        </div>
        <div className="rows" style={{ marginTop: 24 }}>
          <div className="r text">
            <span>One</span>
            <span>
              Open <a href={DREAMDEX_APP} className="accent">dreamDEX ↗</a>, pick this wallet and choose Link a bot at the
              bottom of the wallet list
            </span>
          </div>
          <div className="r text">
            <span>Two</span>
            <span>Paste the key, keep Perps ticked and leave Send it for gas on</span>
          </div>
          <div className="r text">
            <span>Three</span>
            <span>Press Add bot. Hoax notices the link within seconds</span>
          </div>
        </div>
        <p style={{ marginTop: 20 }}>
          {linked ? <span className="tag saved">linked</span> : <span className="tag pending">waiting for the link…</span>}
        </p>
        <StepNav back="/start" next="/start/gas" nextLabel="Gas" nextDisabled={!linked} />
      </div>
    </div>
  );
}
