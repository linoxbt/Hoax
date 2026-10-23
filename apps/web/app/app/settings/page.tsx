"use client";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { AppHead } from "@/components/AppHead";
import { CopyButton } from "@/components/CopyButton";
import { useApp } from "@/lib/appContext";
import { DREAMDEX_APP } from "@/lib/format";
import { api } from "@/lib/session";

export default function Settings() {
  const router = useRouter();
  const { session, setSession, view, refresh, setErr } = useApp();
  const account = view?.account;
  const gas = view?.keyBalance ? BigInt(view.keyBalance) : null;

  async function setPaused(paused: boolean) {
    try {
      await api(`/api/accounts/${session.owner}/pause`, { method: "POST", token: session.token, body: JSON.stringify({ paused }) });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <>
      <AppHead kicker="Settings" title="Control" />
      <div className="wrap pad-s">
        <div className="grid g2" style={{ gap: 24 }}>
          <div className="card">
            <div className="cap soft">Protection</div>
            <h3 style={{ margin: "10px 0" }}>{account?.paused ? "Paused" : "On"}</h3>
            <p className="copy soft">Pausing stops every close at once. Hoax keeps reading health and writing receipts for misses.</p>
            {account && (
              <button className={`pill${account.paused ? "" : " ghost"}`} style={{ marginTop: 16 }} onClick={() => setPaused(!account.paused)}>
                {account.paused ? "Resume Hoax" : "Pause Hoax"}
              </button>
            )}
          </div>
          <div className="card">
            <div className="cap soft">Revoke completely</div>
            <h3 style={{ margin: "10px 0" }}>Unlink the bot</h3>
            <p className="copy soft">In dreamDEX open the wallet, Bots tab, and remove the Hoax key. It stops working straight away.</p>
            <a href={DREAMDEX_APP} className="pill ghost" style={{ marginTop: 16 }}>
              Open dreamDEX ↗
            </a>
          </div>
        </div>

        <h3 style={{ margin: "48px 0 14px" }}>This wallet</h3>
        <div className="rows">
          <div className="r">
            <span>dreamDEX wallet</span>
            <span>{session.owner}</span>
          </div>
          <div className="r">
            <span>Hoax key</span>
            <span>{account?.hoaxKey ?? "–"}</span>
          </div>
          <div className="r">
            <span>Status</span>
            <span>{account?.status.replace("_", " ") ?? "–"}</span>
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

        <h3 style={{ margin: "48px 0 14px" }}>Manage token</h3>
        <div className="panel">
          <div className="spread" style={{ alignItems: "center" }}>
            <div>
              <div className="cap soft">Kept in this browser only. Save it to manage Hoax from another device.</div>
              <code className="mono" style={{ fontSize: 14 }}>
                {session.token}
              </code>
            </div>
            <CopyButton text={session.token} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 40 }}>
          <button
            className="pill ghost"
            onClick={() => {
              setSession(null);
              router.push("/");
            }}
          >
            Forget this wallet on this browser
          </button>
        </div>
      </div>
    </>
  );
}
