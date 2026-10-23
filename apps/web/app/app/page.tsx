"use client";
// One card per position: the health bar with trigger and target, the
// liquidation price, the policy, and the controls to edit or pause.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HealthBar } from "@/components/HealthBar";
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
      <div className="stack">
        <h1>Positions</h1>
        <p>
          This browser is not managing a wallet yet. <Link href="/start">Start here</Link>, or restore with the manage token
          you saved.
        </p>
        <div className="card stack">
          <label className="field">
            <span>dreamDEX wallet</span>
            <input value={restore.owner} onChange={(e) => setRestore({ ...restore, owner: e.target.value })} placeholder="0x…" />
          </label>
          <label className="field">
            <span>Manage token</span>
            <input value={restore.token} onChange={(e) => setRestore({ ...restore, token: e.target.value })} />
          </label>
          <button
            className="btn"
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
    );
  }

  const account = view?.account;
  const policyFor = (m: string) => view?.policies.find((p) => p.market === m);

  return (
    <div className="stack">
      <div className="spread">
        <h1>Positions</h1>
        <div className="row">
          {account && (
            <button className={`btn ${account.paused ? "primary" : ""}`} onClick={() => setPaused(!account.paused)}>
              {account.paused ? "Resume Hoax" : "Pause Hoax"}
            </button>
          )}
          <Link className="btn" href="/app/receipts">
            Receipts
          </Link>
        </div>
      </div>
      <p className="muted small">
        Wallet <span className="mono">{short(session.owner)}</span> · Hoax key{" "}
        <span className="mono">{short(account?.hoaxKey)}</span> ·{" "}
        {account?.status === "active" ? (account.paused ? "paused" : "protecting") : account?.status ?? "loading"}
        {view && view.isOwner === false && " · read-only (manage token not accepted)"}
      </p>
      {err && <div className="notice bad">{err}</div>}
      {account?.status === "pending_link" && (
        <div className="notice">
          The Hoax key is not linked yet. <Link href="/start">Finish onboarding</Link>.
        </div>
      )}
      {account?.status === "unlinked" && (
        <div className="notice bad">The Hoax key was unlinked in dreamDEX, so Hoax is not protecting this wallet.</div>
      )}

      {view && view.positions.length === 0 && <p className="muted">No open perp positions on this wallet.</p>}
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

      {view && view.alerts.length > 0 && (
        <>
          <h2>Alerts</h2>
          <div className="card">
            {view.alerts.map((a) => (
              <p key={a.id} className="small">
                <span className="muted">{ago(a.createdAt)}</span> {a.message}
              </p>
            ))}
          </div>
        </>
      )}
      <p className="small">
        <button
          className="btn"
          onClick={() => {
            clearSession();
            setSession(null);
          }}
        >
          Forget this wallet on this browser
        </button>
      </p>
    </div>
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
    <div className="card">
      <div className="spread">
        <strong>
          {p.market} {p.side} {units(p.size.replace("-", ""), p.baseDecimals)} {p.baseSymbol}
        </strong>
        {policy?.enabled && active ? (
          <span className="badge saved">protected</span>
        ) : policy?.enabled ? (
          <span className="badge skipped">policy on, Hoax inactive</span>
        ) : (
          <span className="badge not-needed">not protected</span>
        )}
      </div>
      <HealthBar health={p.health} trigger={base.triggerHealth} target={base.targetHealth} />
      <dl className="kv small">
        <dt>Health</dt>
        <dd className="mono">{p.health === null ? "–" : p.health.toFixed(3)}</dd>
        <dt>Mark</dt>
        <dd className="mono">
          {usd(p.mark)} {p.markOk ? "" : "(stale: Hoax will not act)"}
        </dd>
        <dt>Liquidation price</dt>
        <dd className="mono">{usd(p.liqPrice)}</dd>
        <dt>Equity / maintenance</dt>
        <dd className="mono">
          {usd(p.equity)} / {usd(p.mmReq)} USDso
        </dd>
        <dt>Policy</dt>
        <dd>
          act at {base.triggerHealth}, restore {base.targetHealth}, ≤{base.maxClosePct}% per step, ≤{base.maxSlippageBps} bps
          slippage
        </dd>
      </dl>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onEdit}>
          {editing ? "Close" : "Edit policy"}
        </button>
        {!policy?.enabled && (
          <button className="btn primary" onClick={() => onSave({ ...base, enabled: true })}>
            Protect this position
          </button>
        )}
      </div>
      {editing && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="grid cols-2">
            {(
              [
                ["triggerHealth", "Trigger health", "0.05"],
                ["targetHealth", "Target health", "0.05"],
                ["maxClosePct", "Max close per action (%)", "1"],
                ["maxSlippageBps", "Max slippage (bps)", "1"],
                ["cooldownSec", "Cooldown (s)", "1"],
                ["lambda", "Act when close ≤ λ × liquidation cost", "0.05"],
              ] as const
            ).map(([k, label, step]) => (
              <label className="field" key={k}>
                <span>{label}</span>
                <input type="number" step={step} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <label className="row small">
            <input type="checkbox" style={{ width: "auto" }} checked={form.allowFullClose} onChange={(e) => setForm({ ...form, allowFullClose: e.target.checked })} />
            Close fully when a partial close would leave less than the market minimum
          </label>
          <label className="row small">
            <input type="checkbox" style={{ width: "auto" }} checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Protect this position
          </label>
          <div>
            <button className="btn primary" onClick={() => onSave(form)}>
              Save policy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
