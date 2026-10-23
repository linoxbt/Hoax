"use client";
// Opt-in to protected in a few minutes: register the wallet, link the Hoax key
// in dreamDEX, check gas, optionally approve the builder fee, set a policy.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, formatEther, parseAbi } from "viem";
import { CopyButton } from "@/components/CopyButton";
import { DREAMDEX_APP, short } from "@/lib/format";
import { api, loadSession, saveSession, type Session } from "@/lib/session";
import type { AccountJson } from "@/lib/types";

type Eth = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eth }).ethereum : undefined);

const APPROVE_ABI = parseAbi(["function approveBuilder(address builder, uint256 maxFeeBpsTimes1k)"]);

export default function Start() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [owner, setOwner] = useState("");
  const [view, setView] = useState<AccountJson | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState<string | null>(null);
  const [policy, setPolicy] = useState({ triggerHealth: 1.25, targetHealth: 1.6, maxClosePct: 50, maxSlippageBps: 30 });
  const [markets, setMarkets] = useState<string[]>([]);
  const [approveTx, setApproveTx] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (s) {
      setSession(s);
      setOwner(s.owner);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const v = await api<AccountJson>(`/api/accounts/${session.owner}?account=${session.accountId}`, { token: session.token });
      setView(v);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [session, refresh]);

  // Default the policy to every market the wallet holds a position in.
  useEffect(() => {
    if (view && markets.length === 0) {
      const held = view.positions.map((p) => p.market);
      setMarkets(held.length > 0 ? held : ["ETH-PERP"]);
    }
  }, [view, markets.length]);

  async function connect() {
    const provider = eth();
    if (!provider) {
      setErr("No browser wallet found. Paste your dreamDEX wallet address instead.");
      return;
    }
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (accounts[0]) {
      setConnected(accounts[0]);
      if (!session) setOwner(accounts[0]);
    }
  }

  async function register() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string; owner: string; token: string }>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ owner: owner.trim() }),
      });
      const s = { owner: r.owner, accountId: r.id, token: r.token };
      saveSession(s);
      setSession(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approveBuilder() {
    const provider = eth();
    if (!provider || !view?.builder.address || !connected) return;
    setErr(null);
    try {
      const pools = view.markets.filter((m) => markets.includes(m.symbol)).map((m) => m.pool);
      for (const pool of pools) {
        const data = encodeFunctionData({
          abi: APPROVE_ABI,
          functionName: "approveBuilder",
          args: [view.builder.address as `0x${string}`, BigInt(view.builder.feeBpsTimes1k)],
        });
        const hash = (await provider.request({ method: "eth_sendTransaction", params: [{ from: connected, to: pool, data }] })) as string;
        setApproveTx(hash);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function turnOn() {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      for (const m of markets) {
        await api(`/api/policies/${session.owner}/${m}?account=${session.accountId}`, {
          method: "PUT",
          token: session.token,
          body: JSON.stringify({ ...policy, enabled: true }),
        });
      }
      router.push("/app");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const status = view?.account?.status;
  const key = view?.account?.hoaxKey ?? null;
  const linked = status === "active";
  const gas = view?.keyBalance ? BigInt(view.keyBalance) : null;
  const lowGas = gas !== null && gas < 10n ** 16n;
  const feeOn = Boolean(view?.builder.address) && (view?.builder.feeBpsTimes1k ?? 0) > 0;
  const ownerConnected = connected && session && connected.toLowerCase() === session.owner.toLowerCase();

  const stepClass = (done: boolean, active: boolean) => (done ? "done" : active ? "active" : "");

  return (
    <div className="stack">
      <h1>Protect your positions</h1>
      <p className="lead">
        Use a dreamDEX wallet that holds only what you want protected, for example Wallet 2. Hoax will be able to trade it,
        never withdraw from it.
      </p>
      {err && <div className="notice bad">{err}</div>}

      <ol className="steps">
        <li className={stepClass(Boolean(session), !session)}>
          <h3>Your dreamDEX wallet</h3>
          {session ? (
            <p className="mono">{session.owner}</p>
          ) : (
            <div className="stack">
              <label className="field">
                <span>The wallet address you trade perps from in dreamDEX</span>
                <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" spellCheck={false} />
              </label>
              <div className="row">
                <button className="btn primary" disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(owner.trim())} onClick={register}>
                  Make my Hoax key
                </button>
                <button className="btn" onClick={connect}>
                  Use connected wallet
                </button>
              </div>
            </div>
          )}
        </li>

        <li className={stepClass(linked, Boolean(session) && !linked)}>
          <h3>Link the Hoax key in dreamDEX</h3>
          {!session && <p className="muted">After step 1.</p>}
          {session && !key && <p className="muted">Making a key just for this wallet…</p>}
          {session && key && (
            <div className="stack">
              <div className="card">
                <div className="small muted">Hoax key for {short(session.owner)}</div>
                <div className="spread">
                  <code style={{ wordBreak: "break-all" }}>{key}</code>
                  <CopyButton text={key} />
                </div>
              </div>
              <ol className="small">
                <li>
                  Open <a href={DREAMDEX_APP}>dreamDEX</a>, pick this wallet, and choose <b>Link a bot</b> at the bottom of
                  the wallet list.
                </li>
                <li>
                  Paste the address above. Keep <b>Perps</b> ticked and leave <b>Send it … for gas</b> on.
                </li>
                <li>
                  Press <b>Add bot</b>. Hoax notices the link within a few seconds.
                </li>
              </ol>
              <p>{linked ? <span className="badge saved">linked</span> : <span className="badge pending">waiting for the link…</span>}</p>
            </div>
          )}
        </li>

        <li className={stepClass(linked && gas !== null && !lowGas, linked && (gas === null || lowGas))}>
          <h3>Gas for Hoax&apos;s orders</h3>
          {!linked && <p className="muted">After the link.</p>}
          {linked && (
            <p>
              The key holds {gas !== null ? `${Number(formatEther(gas)).toFixed(4)} STT` : "an unknown amount of STT"}.{" "}
              {lowGas
                ? "That is low: top it up from dreamDEX (Bots tab, Top up). Each close costs about 0.003 STT."
                : "That covers many closes."}
            </p>
          )}
        </li>

        <li className={stepClass(Boolean(approveTx) || (linked && !feeOn), linked && feeOn && !approveTx)}>
          <h3>Builder fee (optional)</h3>
          {!feeOn && <p className="muted">This Hoax deployment charges no builder fee.</p>}
          {feeOn && view && (
            <div className="stack">
              <p>
                Hoax charges {view.builder.feeBpsTimes1k / 1000} bps on each close, and only if you approve it. Without an
                approval Hoax still protects you and charges nothing. Paper USDso accounts are never charged builder fees.
              </p>
              {ownerConnected ? (
                <button className="btn" onClick={approveBuilder}>
                  Approve {view.builder.feeBpsTimes1k / 1000} bps
                </button>
              ) : (
                <p className="small muted">Connect this wallet in your browser to approve, or skip this step.</p>
              )}
              {approveTx && <p className="small mono">Sent {approveTx.slice(0, 18)}…</p>}
            </div>
          )}
        </li>

        <li className={stepClass(false, linked)}>
          <h3>Policy</h3>
          {!linked && <p className="muted">After the link.</p>}
          {linked && (
            <div className="stack">
              <p className="small muted">
                Markets: {markets.join(", ")}. Hoax acts when health (equity over maintenance margin) falls to the trigger,
                and closes just enough to get back to the target.
              </p>
              <div className="grid cols-2">
                <label className="field">
                  <span>Trigger health</span>
                  <input type="number" step="0.05" value={policy.triggerHealth} onChange={(e) => setPolicy({ ...policy, triggerHealth: Number(e.target.value) })} />
                </label>
                <label className="field">
                  <span>Target health</span>
                  <input type="number" step="0.05" value={policy.targetHealth} onChange={(e) => setPolicy({ ...policy, targetHealth: Number(e.target.value) })} />
                </label>
                <label className="field">
                  <span>Max close per action (%)</span>
                  <input type="number" value={policy.maxClosePct} onChange={(e) => setPolicy({ ...policy, maxClosePct: Number(e.target.value) })} />
                </label>
                <label className="field">
                  <span>Max slippage (bps)</span>
                  <input type="number" value={policy.maxSlippageBps} onChange={(e) => setPolicy({ ...policy, maxSlippageBps: Number(e.target.value) })} />
                </label>
              </div>
              <button className="btn primary" disabled={busy} onClick={turnOn}>
                Turn on Hoax
              </button>
            </div>
          )}
        </li>
      </ol>

      {session && (
        <div className="card small">
          <div className="spread">
            <span>
              This browser keeps your manage token. Save it to manage Hoax from another device:{" "}
              <code>{session.token}</code>
            </span>
            <CopyButton text={session.token} />
          </div>
        </div>
      )}
    </div>
  );
}
