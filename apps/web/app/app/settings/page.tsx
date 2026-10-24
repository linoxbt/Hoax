"use client";
import { useState } from "react";
import { formatEther } from "viem";
import { AppHead } from "@/components/AppHead";
import { CopyButton } from "@/components/CopyButton";
import { LinkGrid } from "@/components/LinkGrid";
import { useApp } from "@/lib/appContext";
import { addressUrl, txUrl } from "@/lib/format";
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
      await api(`/api/accounts/${session.owner}/pause`, { method: "POST", token: session.token, body: JSON.stringify({ paused, chain: session.chainId }) });
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
      <div className="wrap pad-s">
        <div className="grid g2" style={{ gap: "2.4rem" }}>
          <div className="card">
            <div className="cap soft">Protection</div>
            <h3 style={{ margin: "10px 0" }}>{!account ? "Not set up" : account.paused ? "Paused" : "On"}</h3>
            <p className="copy soft">Pausing stops every close at once. The key stays linked.</p>
            {account && (
              <button
                className={`pill${account.paused ? "" : " ghost"}`}
                style={{ marginTop: "1.6rem" }}
                disabled={!canManage || pausing}
                aria-busy={pausing}
                onClick={() => setPaused(!account.paused)}
              >
                {pausing ? "Saving…" : account.paused ? "Resume Hoax" : "Pause Hoax"}
              </button>
            )}
          </div>
          <div className="card">
            <div className="cap soft">Revoke completely</div>
            <h3 style={{ margin: "10px 0" }}>Unlink the Hoax key</h3>
            <p className="copy soft">One transaction from your wallet removes trade access on every market.</p>
            {revoke.phase === "done" ? (
              <p className="note" style={{ marginTop: "1.6rem" }}>
                Revoked.{" "}
                {revoke.hash && (
                  <a className="accent" href={txUrl(revoke.hash, session.chainId)} target="_blank" rel="noreferrer">
                    View tx ↗
                  </a>
                )}
              </p>
            ) : (
              <button
                className="pill ghost"
                style={{ marginTop: "1.6rem" }}
                disabled={hoax.sample || !account?.hoaxKey || !anyLinked || ["building", "confirm", "mining"].includes(revoke.phase)}
                onClick={async () => {
                  if (await revoke.send({ approved: false, builderFee: true })) await refresh();
                }}
              >
                {revoke.phase === "confirm" ? "Confirm in wallet…" : revoke.phase === "mining" ? "Revoking…" : "Revoke access"}
              </button>
            )}
            {revoke.err && (
              <p className="note bad" style={{ marginTop: "1.2rem" }}>
                {revoke.err}
              </p>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: "2.4rem" }}>
          <LinkGrid view={view} />
        </div>

        <h3 style={{ margin: "48px 0 14px" }}>Addresses</h3>
        <div className="rows">
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
            <span className="row" style={{ gap: "1rem" }}>
              {account?.hoaxKey ? (
                <>
                  <a className="mono" href={addressUrl(account.hoaxKey, session.chainId)} target="_blank" rel="noreferrer">
                    {account.hoaxKey}
                  </a>
                  <CopyButton text={account.hoaxKey} ghost />
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

        <div className="row" style={{ marginTop: "4rem" }}>
          <button className="pill ghost" onClick={hoax.disconnect}>
            {hoax.sample ? "Leave the sample account" : "Disconnect wallet"}
          </button>
          {!hoax.sample && hoax.signedIn && (
            <button className="pill ghost" onClick={signOutEverywhere} disabled={signedOut}>
              Sign out everywhere
            </button>
          )}
        </div>
      </div>
    </>
  );
}
