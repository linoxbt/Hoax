"use client";
import { useState } from "react";
import { formatEther } from "viem";
import { AppHead } from "@/components/AppHead";
import { CopyButton } from "@/components/CopyButton";
import { LinkGrid } from "@/components/LinkGrid";
import { Eyebrow } from "@/components/Ui";
import { useApp } from "@/lib/appContext";
import { addressUrl, txUrl } from "@/lib/format";
import { PROTECTION_TITLE, protectionState } from "@/lib/protection";
import { api } from "@/lib/session";
import { useLinkTx } from "@/lib/useLinkTx";
import { useHoax } from "@/lib/wallet";

export default function Settings() {
  const hoax = useHoax();
  const { session, view, refresh, setErr } = useApp();
  const account = view?.account;
  const gas = view?.keyBalance ? BigInt(view.keyBalance) : null;
  const revoke = useLinkTx();
  const anyLinked = view?.links ? Object.values(view.links).some(Boolean) : false;
  const canManage = hoax.sample || hoax.signedIn;
  const [pausing, setPausing] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  async function setPaused(paused: boolean) {
    if (pausing) return;
    setPausing(true);
    try {
      await api(`/api/accounts/${session.owner}/pause`, {
        method: "POST",
        token: session.token,
        body: JSON.stringify({ paused, chain: session.chainId }),
      });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPausing(false);
    }
  }

  async function signOutEverywhere() {
    try {
      await api("/api/auth/logout", { method: "POST", token: session.token });
      setSignedOut(true);
      hoax.disconnect();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <>
      <AppHead kicker="Account" title="Settings" />
      <div className="db-two">
        <section className="dark db-set">
          <Eyebrow>Protection</Eyebrow>
          <h2 className="h3">{!account ? "Not set up" : PROTECTION_TITLE[protectionState(view, hoax.engine)]}</h2>
          <p className="txt">Pausing stops every close at once. The key stays linked.</p>
          {account && (
            <button
              className={`btn${account.paused ? "" : " white"}`}
              disabled={!canManage || pausing}
              aria-busy={pausing}
              onClick={() => setPaused(!account.paused)}
            >
              <span>{pausing ? "Saving…" : account.paused ? "Resume Hoax" : "Pause Hoax"}</span>
            </button>
          )}
        </section>
        <section className="card db-set">
          <Eyebrow>Revoke completely</Eyebrow>
          <h2 className="h3">Unlink the Hoax key</h2>
          <p className="txt">One transaction from your wallet removes trade access on every market.</p>
          {revoke.phase === "done" ? (
            <p className="note">
              {/* Said only once the chain shows every market unlinked, not when the transaction succeeds. */}
              {anyLinked ? "Revoke sent. Waiting for every market to show the key unlinked…" : "Revoked on every market."}{" "}
              {revoke.hash && (
                <a className="accent" href={txUrl(revoke.hash, session.chainId)} target="_blank" rel="noreferrer">
                  View tx ↗
                </a>
              )}
            </p>
          ) : (
            <button
              className="btn ghost"
              disabled={hoax.sample || !account?.hoaxKey || !anyLinked || ["building", "confirm", "mining"].includes(revoke.phase)}
              onClick={async () => {
                if (await revoke.send({ approved: false, builderFee: true })) await refresh();
              }}
            >
              <span>{revoke.phase === "confirm" ? "Confirm in wallet…" : revoke.phase === "mining" ? "Revoking…" : "Revoke access"}</span>
            </button>
          )}
          {revoke.err && <p className="note bad">{revoke.err}</p>}
        </section>
      </div>

      <section className="panel db-access">
        <Eyebrow>Your access / by market</Eyebrow>
        <div className="panel-in">
          <LinkGrid view={view} />
        </div>
      </section>

      <section className="card db-addr">
        <div className="db-card-h">
          <h2 className="h5">Addresses</h2>
          <span className="db-label">{account?.status.replace("_", " ") ?? "not registered"}</span>
        </div>
        <div className="rows db-rows">
          <div className="r">
            <span>Wallet</span>
            <span className="mono">{hoax.wallet ?? (hoax.sample ? "sample" : "–")}</span>
          </div>
          <div className="r">
            <span>dreamDEX account</span>
            <a className="mono" href={addressUrl(session.owner, session.chainId)} target="_blank" rel="noreferrer">
              {session.owner}
            </a>
          </div>
          <div className="r">
            <span>Hoax key</span>
            <span className="db-keyval">
              {account?.hoaxKey ? (
                <>
                  <a className="mono" href={addressUrl(account.hoaxKey, session.chainId)} target="_blank" rel="noreferrer">
                    {account.hoaxKey}
                  </a>
                  <CopyButton text={account.hoaxKey} ghost sm />
                </>
              ) : (
                "–"
              )}
            </span>
          </div>
          <div className="r">
            <span>Status</span>
            <span>{account?.status.replace("_", " ") ?? "not registered"}</span>
          </div>
          <div className="r">
            <span>Key gas</span>
            <span>{gas !== null ? `${Number(formatEther(gas)).toFixed(4)} STT` : "–"}</span>
          </div>
          <div className="r">
            <span>Builder fee approval</span>
            <span>{account ? `${Number(account.builderApproval1k) / 1000} bps` : "–"}</span>
          </div>
        </div>
      </section>

      <div className="db-actions db-leave">
        <button className="btn ghost" onClick={hoax.disconnect}>
          <span>{hoax.sample ? "Leave the sample account" : "Disconnect wallet"}</span>
        </button>
        {!hoax.sample && hoax.signedIn && (
          <button className="btn ghost" onClick={signOutEverywhere} disabled={signedOut}>
            <span>Sign out everywhere</span>
          </button>
        )}
      </div>
    </>
  );
}
