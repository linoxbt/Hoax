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
          Trade-only. Fills always settle to your wallet.
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
              Generating key…
            </p>
          )}
        </div>
        <div className="rows" style={{ marginTop: 24 }}>
          <div className="r text">
            <span>One</span>
            <span>
              Open <a href={DREAMDEX_APP} className="accent">dreamDEX ↗</a> → wallet → Link a bot
            </span>
          </div>
          <div className="r text">
            <span>Two</span>
            <span>Paste the key · Perps on · send gas</span>
          </div>
          <div className="r text">
            <span>Three</span>
            <span>Add bot · detected in seconds</span>
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
