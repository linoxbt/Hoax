"use client";
// Opt-in to protected in a few minutes: register the wallet, link the Hoax key
// in dreamDEX, check gas, optionally approve the builder fee, set a policy.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, formatEther, parseAbi } from "viem";
import { Edge } from "@/components/Bars";
import { CopyButton } from "@/components/CopyButton";
import { Kicker } from "@/components/Kicker";
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
    <>
      <section className="sec char">
        <div className="wrap pad" style={{ paddingBottom: 56 }}>
          <Kicker left>Onboarding · about two minutes</Kicker>
          <div className="spread">
            <h1>
              Protect your
              <br />
              positions
            </h1>
            <p className="copy soft" style={{ maxWidth: 420 }}>
              Use a dreamDEX wallet that holds only what you want protected, such as Wallet 2. Hoax will be able to trade it,
              never withdraw from it.
            </p>
          </div>
          {err && (
            <p className="note bad" style={{ marginTop: 28 }}>
              {err}
            </p>
          )}
        </div>
      </section>

      <section className="sec sand">
        <Edge color="char" seed={21} />
        <div className="wrap pad" style={{ paddingTop: 32 }}>
          <ol className="steps">
            <li className={stepClass(Boolean(session), !session)}>
              <span className="n">01</span>
              <div className="stack">
                <h3>Your dreamDEX wallet</h3>
                {session ? (
                  <p className="mono" style={{ fontSize: 14 }}>
                    {session.owner}
                  </p>
                ) : (
                  <>
                    <label className="field" style={{ maxWidth: 560 }}>
                      <span>The wallet address you trade perps from in dreamDEX</span>
                      <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" spellCheck={false} />
                    </label>
                    <div className="row">
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
            </li>

            <li className={stepClass(linked, Boolean(session) && !linked)}>
              <span className="n">02</span>
              <div className="stack">
                <h3>Link the Hoax key in dreamDEX</h3>
                {!session && <p className="copy soft">After step 01.</p>}
                {session && !key && <p className="copy soft">Making a key just for this wallet…</p>}
                {session && key && (
                  <>
                    <div className="panel" style={{ maxWidth: 640 }}>
                      <div className="cap soft">Hoax key for {short(session.owner)}</div>
                      <div className="spread" style={{ marginTop: 8, alignItems: "center" }}>
                        <code className="mono" style={{ fontSize: 15 }}>
                          {key}
                        </code>
                        <CopyButton text={key} />
                      </div>
                    </div>
                    <div className="rows" style={{ maxWidth: 640 }}>
                      <div className="r">
                        <span>One</span>
                        <span style={{ fontFamily: "var(--label)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Open <a href={DREAMDEX_APP}>dreamDEX ↗</a>, pick this wallet, choose Link a bot
                        </span>
                      </div>
                      <div className="r">
                        <span>Two</span>
                        <span style={{ fontFamily: "var(--label)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Paste the key · keep Perps ticked · leave Send it for gas on
                        </span>
                      </div>
                      <div className="r">
                        <span>Three</span>
                        <span style={{ fontFamily: "var(--label)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Press Add bot · Hoax notices within seconds
                        </span>
                      </div>
                    </div>
                    <p>{linked ? <span className="tag saved">linked</span> : <span className="tag pending">waiting for the link…</span>}</p>
                  </>
                )}
              </div>
            </li>

            <li className={stepClass(linked && gas !== null && !lowGas, linked && (gas === null || lowGas))}>
              <span className="n">03</span>
              <div className="stack">
                <h3>Gas for Hoax&apos;s orders</h3>
                {!linked && <p className="copy soft">After the link.</p>}
                {linked && (
                  <p className="copy">
                    The key holds {gas !== null ? `${Number(formatEther(gas)).toFixed(4)} STT` : "an unknown amount of STT"}.{" "}
                    {lowGas
                      ? "That is low: top it up from dreamDEX (Bots tab, Top up). Each close costs about 0.003 STT."
                      : "That covers many closes."}
                  </p>
                )}
              </div>
            </li>

            <li className={stepClass(Boolean(approveTx) || (linked && !feeOn), linked && feeOn && !approveTx)}>
              <span className="n">04</span>
              <div className="stack">
                <h3>Builder fee · optional</h3>
                {!feeOn && <p className="copy soft">This Hoax deployment charges no builder fee.</p>}
                {feeOn && view && (
                  <>
                    <p className="copy">
                      Hoax charges {view.builder.feeBpsTimes1k / 1000} bps on each close, and only if you approve it. Without an
                      approval Hoax still protects you and charges nothing. Paper USDso accounts are never charged.
                    </p>
                    {ownerConnected ? (
                      <button className="pill" onClick={approveBuilder}>
                        Approve {view.builder.feeBpsTimes1k / 1000} bps
                      </button>
                    ) : (
                      <p className="cap soft">Connect this wallet in your browser to approve, or skip this step.</p>
                    )}
                    {approveTx && <p className="mono">Sent {approveTx.slice(0, 18)}…</p>}
                  </>
                )}
              </div>
            </li>

            <li className={stepClass(false, linked)}>
              <span className="n">05</span>
              <div className="stack">
                <h3>Policy</h3>
                {!linked && <p className="copy soft">After the link.</p>}
                {linked && (
                  <>
                    <p className="copy soft">
                      Markets: {markets.join(", ")}. Hoax acts when health, equity over maintenance margin, falls to the trigger,
                      and closes just enough to get back to the target.
                    </p>
                    <div className="grid g4" style={{ maxWidth: 820 }}>
                      <label className="field">
                        <span>Trigger health</span>
                        <input type="number" step="0.05" value={policy.triggerHealth} onChange={(e) => setPolicy({ ...policy, triggerHealth: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Target health</span>
                        <input type="number" step="0.05" value={policy.targetHealth} onChange={(e) => setPolicy({ ...policy, targetHealth: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Max close / step %</span>
                        <input type="number" value={policy.maxClosePct} onChange={(e) => setPolicy({ ...policy, maxClosePct: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Max slippage bps</span>
                        <input type="number" value={policy.maxSlippageBps} onChange={(e) => setPolicy({ ...policy, maxSlippageBps: Number(e.target.value) })} />
                      </label>
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="pill" disabled={busy} onClick={turnOn}>
                        Turn on Hoax
                      </button>
                    </div>
                  </>
                )}
              </div>
            </li>
          </ol>

          {session && (
            <div className="panel" style={{ marginTop: 48 }}>
              <div className="spread" style={{ alignItems: "center" }}>
                <div>
                  <div className="cap soft">Manage token · kept in this browser</div>
                  <code className="mono" style={{ fontSize: 14 }}>
                    {session.token}
                  </code>
                  <div className="cap soft" style={{ marginTop: 6 }}>
                    Save it to manage Hoax from another device.
                  </div>
                </div>
                <CopyButton text={session.token} />
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
