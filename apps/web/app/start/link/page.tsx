"use client";
// Step 2: register, receive a dedicated Hoax key, and link it on every perp
// market with one transaction from the wallet to its dreamDEX account.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { LinkGrid } from "@/components/LinkGrid";
import { StepNav } from "@/components/StepNav";
import { DREAMDEX_APP, addressUrl, short, txUrl } from "@/lib/format";
import { api } from "@/lib/session";
import { useStart } from "@/lib/startContext";
import { useLinkTx } from "@/lib/useLinkTx";
import { useHoax } from "@/lib/wallet";

const GRANTS = [
  ["Place orders", "placeOrderFor · immediate-or-cancel closes only"],
  ["Cancel orders", "cancelOrderFor"],
  ["Reduce orders", "reduceOrderFor"],
] as const;

export default function LinkStep() {
  const hoax = useHoax();
  const { session, view, linked, linkedMarkets, setErr, refresh } = useStart();
  const tx = useLinkTx();
  const [registering, setRegistering] = useState(false);
  const [builderFee, setBuilderFee] = useState(true);
  const asked = useRef(false);

  const account = view?.account ?? null;
  const key = account?.hoaxKey ?? null;
  const offline = hoax.engine?.mode === "demo";
  // A trader who trades from the wallet itself gets one registry-wide grant (see DreamDexAccounts.buildLinkTx).
  const plainKey = Boolean(session && hoax.wallet && session.owner === hoax.wallet.toLowerCase());
  const feeOn = !plainKey && Boolean(view?.builder.address) && (view?.builder.feeBpsTimes1k ?? 0) > 0;

  // Register once the wallet is verified and the account is known.
  useEffect(() => {
    if (!session || !hoax.signedIn || !view || account || offline || asked.current) return;
    asked.current = true;
    setRegistering(true);
    api("/api/accounts", { method: "POST", token: session.token, body: JSON.stringify({ owner: session.owner, chain: session.chainId }) })
      .then(() => refresh())
      .catch((e) => setErr((e as Error).message))
      .finally(() => setRegistering(false));
  }, [session, hoax.signedIn, view, account, offline, refresh, setErr]);

  if (session === undefined) return null;
  if (!session || !hoax.signedIn)
    return (
      <p className="copy">
        Start with <Link href="/start" className="accent">step 01</Link>: connect and verify your wallet.
      </p>
    );

  const busy = ["building", "confirm", "mining"].includes(tx.phase);
  const label =
    tx.phase === "building" ? "Preparing…" : tx.phase === "confirm" ? "Confirm in your wallet…" : tx.phase === "mining" ? "Linking on chain…" : "Link Hoax · one transaction";

  return (
    <div className="grid g-aside" style={{ gap: "4.8rem" }}>
      <div>
        <h2>Link Hoax</h2>
        <p className="copy soft" style={{ marginTop: "2rem" }}>
          A dedicated key, trade-only, on every perp market. Revoke any time.
        </p>
      </div>
      <div>
        {offline ? (
          <div className="panel">
            <div className="cap soft">Engine offline</div>
            <p className="copy" style={{ marginTop: "0.8rem" }}>
              This deployment has no protection engine running, so it cannot issue keys yet. Your wallet and positions above are read live.
            </p>
          </div>
        ) : !key ? (
          <div className="panel">
            <div className="cap soft">Your Hoax key</div>
            <p className="copy" style={{ marginTop: "0.8rem" }}>
              {registering || account?.status === "pending_key" ? (
                <>
                  <span className="spin" aria-hidden /> Issuing a dedicated key for {short(session.owner)}…
                </>
              ) : (
                "Waiting for the engine…"
              )}
            </p>
            {hoax.engine && !(hoax.engine.networks?.[session.chainId]?.online ?? hoax.engine.online) && (
              <p className="cap soft" style={{ marginTop: "0.8rem" }}>
                The engine has not reported in. Keys are issued as soon as it does.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="panel">
              <div className="spread" style={{ alignItems: "center" }}>
                <div>
                  <div className="cap soft">Your Hoax key · one per account</div>
                  <a className="mono" style={{ fontSize: "1.5rem" }} href={addressUrl(key)} target="_blank" rel="noreferrer">
                    {key}
                  </a>
                </div>
                <CopyButton text={key} ghost />
              </div>
            </div>

            <div className="grants">
              {GRANTS.map(([t, d]) => (
                <div key={t}>
                  <span className="dot">✓</span>
                  <b>{t}</b>
                  <small>{d}</small>
                </div>
              ))}
              <div className="no">
                <span className="dot">×</span>
                <b>{plainKey ? "Withdraw, transfer" : "Withdraw, transfer, spot"}</b>
                <small>Not granted. Fills always settle to your account.</small>
              </div>
            </div>
            {plainKey && (
              <p className="note" style={{ marginTop: "1.6rem" }}>
                This account is your wallet itself, with no dreamDEX Safe to batch through, so the grant is registry-wide in one transaction, as
                dreamDEX&apos;s own Link a bot does: the same three order permissions on every pool. Hoax only ever trades the perp markets.
              </p>
            )}

            {feeOn && (
              <label className="toggle">
                <input type="checkbox" checked={builderFee} onChange={(e) => setBuilderFee(e.target.checked)} />
                <span>
                  Approve the {(view!.builder.feeBpsTimes1k / 1000).toString()} bps builder fee in the same transaction
                  <small>Charged only on protective closes. Untick to run fee-free.</small>
                </span>
              </label>
            )}

            <div className="row" style={{ marginTop: "2.4rem" }}>
              {linked || (tx.phase === "done" && linkedMarkets > 0) ? (
                <span className="tag saved">linked on {linkedMarkets} markets</span>
              ) : (
                <button className="pill" disabled={busy || !hoax.wallet} onClick={async () => (await tx.send({ approved: true, builderFee })) && refresh()}>
                  {label}
                </button>
              )}
              {tx.hash && (
                <a className="cap accent" href={txUrl(tx.hash)} target="_blank" rel="noreferrer">
                  {short(tx.hash)} ↗
                </a>
              )}
            </div>
            {tx.err && (
              <p className="note bad" style={{ marginTop: "1.6rem" }}>
                {tx.err}
              </p>
            )}
            {tx.phase === "done" && !linked && (
              <p className="cap soft" style={{ marginTop: "1.2rem" }}>
                <span className="spin" aria-hidden /> Linked on chain. Waiting for the engine to confirm…
              </p>
            )}

            <div className="card" style={{ marginTop: "2.8rem" }}>
              <LinkGrid view={view} />
            </div>

            <details className="alt-path">
              <summary>Prefer dreamDEX&apos;s own Link a bot?</summary>
              <p className="copy soft">
                Open <a href={DREAMDEX_APP} className="accent" target="_blank" rel="noreferrer">dreamDEX ↗</a>, wallet → Link a bot, paste the key
                above with Perps ticked. Hoax detects it within seconds.
              </p>
            </details>
          </>
        )}
        <StepNav back="/start" next="/start/gas" nextLabel="Gas" nextDisabled={!linked} />
      </div>
    </div>
  );
}
