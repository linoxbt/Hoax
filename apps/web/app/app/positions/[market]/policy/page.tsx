"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHead } from "@/components/AppHead";
import { useApp, DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { api } from "@/lib/session";

const FIELDS = [
  ["triggerHealth", "Trigger health", "0.05", "Act at or below."],
  ["targetHealth", "Target health", "0.05", "Restore to."],
  ["maxClosePct", "Max close per step %", "1", "Largest single close."],
  ["maxSlippageBps", "Max slippage bps", "1", "Worst fill vs. mark."],
  ["cooldownSec", "Cooldown s", "1", "Between closes."],
  ["lambda", "Cost gate λ", "0.05", "Max cost vs. liquidation."],
] as const;

export default function PolicyEditor() {
  const { market } = useParams<{ market: string }>();
  const symbol = decodeURIComponent(market);
  const router = useRouter();
  const { session, view, refresh, setErr } = useApp();
  const current = view?.policies.find((x) => x.market === symbol);
  const [form, setForm] = useState({ ...DEFAULT_POLICY_JSON, enabled: true });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (view && !loaded) {
      if (current) setForm({ ...current });
      setLoaded(true);
    }
  }, [view, current, loaded]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/policies/${session.owner}/${symbol}?chain=${session.chainId}`, { method: "PUT", token: session.token, body: JSON.stringify(form) });
      await refresh();
      router.push(`/app/positions/${symbol}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHead kicker={`Policy · ${symbol}`} title="Policy">
        <Link href={`/app/positions/${symbol}`} className="pill ghost">
          ← Position
        </Link>
      </AppHead>
      <div className="wrap pad-s">
        <div className="grid g3" style={{ rowGap: 32 }}>
          {FIELDS.map(([k, label, step, help]) => (
            <label className="field" key={k}>
              <span>{label}</span>
              <input type="number" step={step} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              <span className="cap soft" style={{ marginTop: "0.6rem", textTransform: "none", letterSpacing: "0.04em" }}>
                {help}
              </span>
            </label>
          ))}
        </div>
        <div className="rows" style={{ marginTop: "3.6rem" }}>
          <label className="r text" style={{ cursor: "pointer" }}>
            <span>Full close</span>
            <span className="row">
              <input type="checkbox" checked={form.allowFullClose} onChange={(e) => setForm({ ...form, allowFullClose: e.target.checked })} />
              Allow full close below market minimum
            </span>
          </label>
          <label className="r text" style={{ cursor: "pointer" }}>
            <span>Protection</span>
            <span className="row">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Protection on
            </span>
          </label>
        </div>
        <div className="row" style={{ marginTop: "3.2rem" }}>
          <button className="pill" disabled={busy} onClick={save}>
            Save policy
          </button>
          <button className="pill ghost" onClick={() => setForm({ ...DEFAULT_POLICY_JSON, enabled: true })}>
            Reset to defaults
          </button>
        </div>
      </div>
    </>
  );
}
