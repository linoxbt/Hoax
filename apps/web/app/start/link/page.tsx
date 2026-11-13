"use client";
// Step 2: register, receive a dedicated Hoax key, and link it on every perp
// market with one transaction from the wallet to its dreamDEX account.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { LinkGrid } from "@/components/LinkGrid";
import { StepNav } from "@/components/StepNav";
import { Btn, Eyebrow } from "@/components/Ui";
import { DREAMDEX_APP, addressUrl, short, txUrl } from "@/lib/format";
import { api } from "@/lib/session";
import { useStart } from "@/lib/startContext";
import { useLinkTx } from "@/lib/useLinkTx";
import { useHoax } from "@/lib/wallet";

const GRANTS = [["Place orders", "placeOrderFor · the engine only sends immediate-or-cancel closes"]] as const;

export default function LinkStep() {
  const hoax = useHoax();
  const { session, view, linked, linkedMarkets, setErr, refresh } = useStart();
  const tx = useLinkTx();
  const [registering, setRegistering] = useState(false);
  const [builderFee, setBuilderFee] = useState(true);
  const [registerErr, setRegisterErr] = useState<string | null>(null);
  const asked = useRef<string | null>(null);

  const account = view?.account ?? null;
  const key = account?.hoaxKey ?? null;
  const offline = hoax.engine?.mode === "demo";
  // A trader who trades from the wallet itself gets one registry-wide grant (see DreamDexAccounts.buildLinkTx).
  const plainKey = Boolean(session && hoax.wallet && session.owner === hoax.wallet.toLowerCase());
  const feeOn = !plainKey && Boolean(view?.builder.address) && (view?.builder.feeBpsTimes1k ?? 0) > 0;

  // Register once the wallet is verified and the account is known: once per
  // account and network, again after a failure (Try again), or for another account.
  const target = session ? `${session.chainId}:${session.owner}` : null;
  const register = useCallback(() => {
    if (!session || !target) return;
    asked.current = target;
    setRegisterErr(null);
    setRegistering(true);
    api("/api/accounts", { method: "POST", token: session.token, body: JSON.stringify({ owner: session.owner, chain: session.chainId }) })
      .then(() => refresh())
      .catch((e) => {
        setRegisterErr((e as Error).message);
        setErr((e as Error).message);
      })
      .finally(() => setRegistering(false));
  }, [session, target, refresh, setErr]);
  useEffect(() => {
    if (!session || !hoax.signedIn || !view || account || offline || registerErr || asked.current === target) return;
    register();
  }, [session, hoax.signedIn, view, account, offline, registerErr, target, register]);

  if (session === undefined) return null;
  if (!session || !hoax.signedIn)
    return (
      <article className="card st-step">
        <p className="txt ink">
          Start with <Link href="/start" className="accent">step 01</Link>: connect and verify your wallet.
        </p>
      </article>
    );

  const busy = ["building", "confirm", "mining"].includes(tx.phase);
  const label =
    tx.phase === "building" ? "Preparing…" : tx.phase === "confirm" ? "Confirm in your wallet…" : tx.phase === "mining" ? "Linking on chain…" : "Link Hoax · one transaction";

  return (
    <article className="card st-step">
      <div className="st-grid">
        <div className="st-explain">
          <Eyebrow>Step 02 / Link</Eyebrow>
          <h2 className="h2">Link Hoax</h2>
          <p className="txt">A dedicated key, trade-only, on every perp market. Revoke any time.</p>
          <div className="panel st-ctx">
            <Eyebrow>What this grants</Eyebrow>
            {GRANTS.map(([t, d]) => (
              <div key={t} className="st-li">
                <span className="st-mk">✓</span>
                <span>
                  <b>{t}</b>
                  <small>{d}</small>
                </span>
              </div>
            ))}
            <Eyebrow>What it cannot do</Eyebrow>
            <div className="st-li">
              <span className="st-mk no">×</span>
              <span>
                <b>Cancel or reduce your orders</b>
                <small>Not granted: your own take-profits and stops are out of its reach.</small>
              </span>
            </div>
            <div className="st-li">
              <span className="st-mk no">×</span>
              <span>
                <b>{plainKey ? "Withdraw, transfer" : "Withdraw, transfer, spot"}</b>
                <small>Not granted. Fills always settle to your account.</small>
              </span>
            </div>
          </div>
          {key && plainKey && (
            <p className="note">
              This account is your wallet itself, with no dreamDEX Safe to batch through, so the grant is registry-wide in one transaction:
              placing orders on every pool, spot included. Hoax only ever trades the perp markets. A builder fee cannot ride this link.
            </p>
          )}
        </div>

        <div className="st-act">
          {offline ? (
            <div className="panel st-ctx">
              <Eyebrow>Engine offline</Eyebrow>
              <p className="txt ink">
                This deployment has no protection engine running, so it cannot issue keys yet. Your wallet and positions above are read live.
              </p>
            </div>
          ) : !key ? (
            <div className="panel st-ctx">
              <Eyebrow>Your Hoax key</Eyebrow>
              <div className="panel-in">
                <p className="txt ink">
                  {registerErr ? (
                    <>Could not register: {registerErr}</>
                  ) : registering || account?.status === "pending_key" ? (
                    <>
                      <span className="spin" aria-hidden /> Issuing a dedicated key for {short(session.owner)}…
                    </>
                  ) : (
                    "Waiting for the engine…"
                  )}
                </p>
                {registerErr && (
                  <div style={{ marginTop: "1.6rem" }}>
                    <Btn disabled={registering} onClick={register}>
                      Try again
                    </Btn>
                  </div>
                )}
              </div>
              {hoax.engine && !(hoax.engine.networks?.[session.chainId]?.online ?? hoax.engine.online) && (
                <p className="mono-xs soft">The engine has not reported in. Keys are issued as soon as it does.</p>
              )}
            </div>
          ) : (
            <>
              <div className="st-box tint st-key">
                <div>
                  <span className="eyebrow">Your Hoax key / one per account</span>
                  <a href={addressUrl(key, session.chainId)} target="_blank" rel="noreferrer">
                    {key}
                  </a>
                </div>
                <CopyButton text={key} ghost sm />
              </div>

              <div className="dark st-tx">
                <div className="st-tx-top">
                  <span className="eyebrow">The one transaction</span>
                  <span className="mono-xs">From your wallet</span>
                </div>
                <h3 className="h4">Link the key on every perp market at once.</h3>
                {feeOn && (
                  <label className="st-toggle">
                    <input type="checkbox" checked={builderFee} onChange={(e) => setBuilderFee(e.target.checked)} />
                    <span>
                      Approve the {(view!.builder.feeBpsTimes1k / 1000).toString()} bps builder fee in the same transaction
                      <small>Charged only on protective closes. Untick to run fee-free.</small>
                    </span>
                  </label>
                )}
                <div className="st-tx-act">
                  {linked || (tx.phase === "done" && linkedMarkets > 0) ? (
                    <span className="tag saved">linked on {linkedMarkets} markets</span>
                  ) : (
                    <Btn fill disabled={busy || !hoax.wallet} onClick={async () => (await tx.send({ approved: true, builderFee })) && refresh()}>
                      {label}
                    </Btn>
                  )}
                  {tx.hash && (
                    <a className="st-hash" href={txUrl(tx.hash, session.chainId)} target="_blank" rel="noreferrer">
                      {short(tx.hash)} ↗
                    </a>
                  )}
                </div>
                {tx.err && <p className="note bad">{tx.err}</p>}
                {tx.phase === "done" && !linked && (
                  <p className="st-wait-line">
                    <span className="spin" aria-hidden /> Linked on chain. Waiting for the engine to confirm…
                  </p>
                )}
              </div>

              <div className="st-box">
                <LinkGrid view={view} />
              </div>

              <details className="st-alt">
                <summary>Prefer dreamDEX&apos;s own Link a bot?</summary>
                <p>
                  Open <a href={DREAMDEX_APP} className="accent" target="_blank" rel="noreferrer">dreamDEX ↗</a>, wallet → Link a bot, paste the key
                  above with Perps ticked. Hoax detects it within seconds.
                </p>
              </details>
            </>
          )}
        </div>
      </div>
      <StepNav back="/start" next="/start/gas" nextLabel="Gas" nextDisabled={!linked} />
    </article>
  );
}
