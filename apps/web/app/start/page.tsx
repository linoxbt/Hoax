"use client";
// Step 1: which dreamDEX wallet Hoax protects.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { StepNav } from "@/components/StepNav";
import { api } from "@/lib/session";
import { useStart } from "@/lib/startContext";

type Eth = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export default function WalletStep() {
  const router = useRouter();
  const { session, setSession, setErr } = useStart();
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    const provider = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!provider) {
      setErr("No browser wallet found. Paste your dreamDEX wallet address instead.");
      return;
    }
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (accounts[0]) setOwner(accounts[0]);
  }

  async function register() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string; owner: string; token: string }>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ owner: owner.trim() }),
      });
      setSession({ owner: r.owner, accountId: r.id, token: r.token });
      router.push("/start/link");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) return null;

  return (
    <div className="grid g-aside" style={{ gap: 48 }}>
      <div>
        <h2>Your dreamDEX wallet</h2>
        <p className="copy soft" style={{ marginTop: 20 }}>
          Use a wallet that holds only what you want protected, such as Wallet 2. Hoax will be able to trade it, never withdraw
          from it.
        </p>
      </div>
      <div>
        {session ? (
          <>
            <div className="card">
              <div className="cap soft">This browser manages</div>
              <div className="mono" style={{ fontSize: 15, marginTop: 6 }}>
                {session.owner}
              </div>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <div className="spread" style={{ alignItems: "center" }}>
                <div>
                  <div className="cap soft">Manage token · kept in this browser</div>
                  <code className="mono" style={{ fontSize: 14 }}>
                    {session.token}
                  </code>
                </div>
                <CopyButton text={session.token} ghost />
              </div>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="pill ghost" onClick={() => setSession(null)}>
                Use a different wallet
              </button>
            </div>
            <StepNav next="/start/link" nextLabel="Link the key" />
          </>
        ) : (
          <>
            <label className="field">
              <span>The wallet address you trade perps from in dreamDEX</span>
              <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" spellCheck={false} />
            </label>
            <div className="row" style={{ marginTop: 20 }}>
              <button className="pill" disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(owner.trim())} onClick={register}>
                Make my Hoax key
              </button>
              <button className="pill ghost" onClick={connect}>
                Use connected wallet
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
