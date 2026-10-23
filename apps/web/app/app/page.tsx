"use client";
// One card per position: the health bar with trigger and target, the
// liquidation price, the policy, and the controls to edit or pause.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Edge } from "@/components/Bars";
import { HealthField } from "@/components/HealthField";
import { Kicker } from "@/components/Kicker";
import { ago, short, units, usd } from "@/lib/format";
import { api, clearSession, loadSession, saveSession, type Session } from "@/lib/session";
import type { AccountJson, PolicyJson, PositionJson } from "@/lib/types";

const DEFAULTS: Omit<PolicyJson, "market"> = {
  triggerHealth: 1.25,
  targetHealth: 1.6,
  maxClosePct: 50,
  maxSlippageBps: 30,
  cooldownSec: 30,
  floorSize: null,
  lambda: 0.5,
  triggerMargin: 0.02,
  allowFullClose: true,
  enabled: false,
};

export default function Positions() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<AccountJson | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [restore, setRestore] = useState({ owner: "", token: "" });

  useEffect(() => {
    setSession(loadSession());
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setView(await api<AccountJson>(`/api/accounts/${session.owner}`, { token: session.token }));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [session, refresh]);

  async function setPaused(paused: boolean) {
    if (!session) return;
    try {
      await api(`/api/accounts/${session.owner}/pause`, { method: "POST", token: session.token, body: JSON.stringify({ paused }) });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function savePolicy(market: string, p: Omit<PolicyJson, "market">) {
    if (!session) return;
    try {
      await api(`/api/policies/${session.owner}/${market}`, { method: "PUT", token: session.token, body: JSON.stringify(p) });
      setEditing(null);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!loaded) return null;

  if (!session) {
    return (
      <>
        <section className="sec char">
          <div className="wrap pad">
            <Kicker left>Positions</Kicker>
            <h1>Nothing here yet</h1>
            <p className="copy soft" style={{ marginTop: 20 }}>
              This browser is not managing a wallet. <Link href="/start">Start here ↗</Link>, or restore with the manage token
              you saved.
            </p>
          </div>
        </section>
        <section className="sec sand">
          <Edge color="char" seed={15} />
          <div className="wrap pad" style={{ paddingTop: 32 }}>
            <div className="grid g3" style={{ alignItems: "end" }}>
              <label className="field">
                <span>dreamDEX wallet</span>
                <input value={restore.owner} onChange={(e) => setRestore({ ...restore, owner: e.target.value })} placeholder="0x…" />
              </label>
              <label className="field">
                <span>Manage token</span>
                <input value={restore.token} onChange={(e) => setRestore({ ...restore, token: e.target.value })} />
              </label>
              <div>
                <button
                  className="pill"
                  onClick={() => {
                    const s = { owner: restore.owner.trim().toLowerCase(), accountId: "", token: restore.token.trim() };
                    saveSession(s);
                    setSession(s);
                  }}
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  const account = view?.account;
  const policyFor = (m: string) => view?.policies.find((p) => p.market === m);
  const state = account?.status === "active" ? (account.paused ? "paused" : "protecting") : account?.status?.replace("_", " ") ?? "loading";

  return (
    <>
      <section className="sec char">
        <div className="wrap pad" style={{ paddingBottom: 48 }}>
          <Kicker left>Positions</Kicker>
          <div className="spread">
            <h1>{state}</h1>
            <div className="row">
              {account && (
                <button className={`pill${account.paused ? "" : " ghost"}`} onClick={() => setPaused(!account.paused)}>
                  {account.paused ? "Resume Hoax" : "Pause Hoax"}
                </button>
              )}
              <Link className="pill ghost" href="/app/receipts">
                Receipts
              </Link>
            </div>
          </div>
          <div className="grid g3 cap" style={{ marginTop: 40 }}>
            <div>
              <div className="soft">Wallet</div>
              <span className="mono" style={{ fontSize: 13 }}>{short(session.owner)}</span>
            </div>
            <div>
              <div className="soft">Hoax key</div>
              <span className="mono" style={{ fontSize: 13 }}>{short(account?.hoaxKey)}</span>
            </div>
            <div>
              <div className="soft">Access</div>
              {view && view.isOwner === false ? "read-only · manage token not accepted" : "manage token accepted"}
            </div>
          </div>
          {err && <p className="note bad" style={{ marginTop: 24 }}>{err}</p>}
          {account?.status === "pending_link" && (
            <p className="note" style={{ marginTop: 24 }}>
              The Hoax key is not linked yet. <Link href="/start">Finish onboarding ↗</Link>
            </p>
          )}
          {account?.status === "unlinked" && (
            <p className="note bad" style={{ marginTop: 24 }}>The Hoax key was unlinked in dreamDEX, so Hoax is not protecting this wallet.</p>
          )}
        </div>
      </section>

      <section className="sec sand">
        <Edge color="char" seed={17} />
        <div className="wrap pad" style={{ paddingTop: 32 }}>
          {view && view.positions.length === 0 && <p className="copy soft">No open perp positions on this wallet.</p>}
          <div className="stack" style={{ display: "grid", gap: 56 }}>
            {view?.positions.map((p) => (
              <PositionCard
                key={p.market}
                active={account?.status === "active" && !account.paused}
                p={p}
                policy={policyFor(p.market)}
                editing={editing === p.market}
                onEdit={() => setEditing(editing === p.market ? null : p.market)}
                onSave={(pol) => savePolicy(p.market, pol)}
              />
            ))}
          </div>
        </div>
      </section>

      {view && view.alerts.length > 0 && (
        <section className="sec char">
          <Edge color="sand" seed={19} />
          <div className="wrap pad" style={{ paddingTop: 32 }}>
            <Kicker left>Alerts</Kicker>
            <div className="rows">
              {view.alerts.map((a) => (
                <div className="r" key={a.id}>
                  <span>{ago(a.createdAt)}</span>
                  <span style={{ fontFamily: "var(--label)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "left" }}>{a.message}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className={`sec ${view && view.alerts.length > 0 ? "char" : "sand"}`}>
        <div className="wrap" style={{ paddingBottom: 48 }}>
          <button
            className="pill ghost"
            onClick={() => {
              clearSession();
              setSession(null);
            }}
          >
            Forget this wallet on this browser
          </button>
        </div>
      </section>
    </>
  );
}

function PositionCard({
  active,
  p,
  policy,
  editing,
  onEdit,
  onSave,
}: {
  active: boolean;
  p: PositionJson;
  policy: PolicyJson | undefined;
  editing: boolean;
  onEdit: () => void;
  onSave: (p: Omit<PolicyJson, "market">) => void;
}) {
  const base = policy ?? { ...DEFAULTS, market: p.market };
  const [form, setForm] = useState(base);
  useEffect(() => setForm(policy ?? { ...DEFAULTS, market: p.market }), [policy, p.market]);

  return (
    <article>
      <div className="spread" style={{ borderBottom: "1px solid var(--char)", paddingBottom: 14 }}>
        <div>
          <div className="cap soft">
            {p.side} · {units(p.size.replace("-", ""), p.baseDecimals)} {p.baseSymbol}
          </div>
          <h2>{p.market}</h2>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          {policy?.enabled && active ? (
            <span className="tag saved">protected</span>
          ) : policy?.enabled ? (
            <span className="tag skipped">policy on · Hoax inactive</span>
          ) : (
            <span className="tag not-needed">not protected</span>
          )}
          <div className="num m">{p.health === null ? "–" : p.health.toFixed(2)}</div>
        </div>
      </div>
      <HealthField health={p.health} trigger={base.triggerHealth} target={base.targetHealth} />
      <div className="grid g2" style={{ marginTop: 24, gap: 40 }}>
        <div className="rows">
          <div className="r">
            <span>Mark</span>
            <span>
              {usd(p.mark)} {p.markOk ? "" : "· stale, Hoax will not act"}
            </span>
          </div>
          <div className="r">
            <span>Liquidation price</span>
            <span>{usd(p.liqPrice)}</span>
          </div>
          <div className="r">
            <span>Equity / maintenance</span>
            <span>
              {usd(p.equity)} / {usd(p.mmReq)} USDso
            </span>
          </div>
        </div>
        <div className="rows">
          <div className="r">
            <span>Acts at</span>
            <span>{base.triggerHealth}</span>
          </div>
          <div className="r">
            <span>Restores</span>
            <span>{base.targetHealth}</span>
          </div>
          <div className="r">
            <span>Per step · slippage</span>
            <span>
              ≤{base.maxClosePct}% · ≤{base.maxSlippageBps} bps
            </span>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 20 }}>
        <button className="pill ghost" onClick={onEdit}>
          {editing ? "Close" : "Edit policy"}
        </button>
        {!policy?.enabled && (
          <button className="pill" onClick={() => onSave({ ...base, enabled: true })}>
            Protect this position
          </button>
        )}
      </div>
      {editing && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="grid g3">
            {(
              [
                ["triggerHealth", "Trigger health", "0.05"],
                ["targetHealth", "Target health", "0.05"],
                ["maxClosePct", "Max close per step %", "1"],
                ["maxSlippageBps", "Max slippage bps", "1"],
                ["cooldownSec", "Cooldown s", "1"],
                ["lambda", "Act when close ≤ λ × liquidation", "0.05"],
              ] as const
            ).map(([k, label, step]) => (
              <label className="field" key={k}>
                <span>{label}</span>
                <input type="number" step={step} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <label className="row cap" style={{ marginTop: 20 }}>
            <input type="checkbox" checked={form.allowFullClose} onChange={(e) => setForm({ ...form, allowFullClose: e.target.checked })} />
            Close fully when a partial close would leave less than the market minimum
          </label>
          <label className="row cap" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Protect this position
          </label>
          <div style={{ marginTop: 20 }}>
            <button className="pill" onClick={() => onSave(form)}>
              Save policy
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
