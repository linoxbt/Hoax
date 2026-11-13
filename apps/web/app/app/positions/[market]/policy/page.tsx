"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHead } from "@/components/AppHead";
import { HealthField } from "@/components/HealthField";
import { Btn, Eyebrow } from "@/components/Ui";
import { useApp, DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { BOUNDS, fromInput, policyProblems, toInput } from "@/lib/policyForm";
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
  const position = view?.positions.find((x) => x.market === symbol);
  const [form, setForm] = useState({ ...DEFAULT_POLICY_JSON, enabled: true });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (view && !loaded) {
      if (current) setForm({ ...current });
      setLoaded(true);
    }
  }, [view, current, loaded]);

  const problems = policyProblems(form);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

  async function save() {
    if (problems.length > 0) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/policies/${session.owner}/${symbol}?chain=${session.chainId}`, {
        method: "PUT",
        token: session.token,
        body: JSON.stringify(form),
      });
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
        <Btn href={`/app/positions/${symbol}`} arrow="w">
          Position
        </Btn>
      </AppHead>
      <section className="card db-editor">
        <div className="db-editor-l">
          <div className="db-card-h">
            <h2 className="h5">Policy editor</h2>
            <span className="db-label">{symbol}</span>
          </div>
          <div className="db-fields">
            {FIELDS.map(([k, label, step, help]) => (
              <label className="field db-field" key={k}>
                <span>{label}</span>
                <input
                  type="number"
                  step={step}
                  min={BOUNDS[k]?.min}
                  max={BOUNDS[k]?.max}
                  value={toInput(form[k])}
                  onChange={(e) => setForm({ ...form, [k]: fromInput(e.target.value) })}
                />
                <small>{help}</small>
              </label>
            ))}
          </div>
          <div className="db-toggles">
            <label className="db-toggle">
              <span>
                <b>Full close</b>
                <small>Allow full close below market minimum</small>
              </span>
              <input type="checkbox" checked={form.allowFullClose} onChange={(e) => setForm({ ...form, allowFullClose: e.target.checked })} />
            </label>
            <label className="db-toggle">
              <span>
                <b>Protection</b>
                <small>Protection on</small>
              </span>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            </label>
          </div>
          {problems.length > 0 && (
            <ul className="note bad db-problems" role="alert">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="db-actions">
            <button className="btn" disabled={busy || problems.length > 0} onClick={save}>
              <span>Save policy</span>
            </button>
            <button className="btn ghost" onClick={() => setForm({ ...DEFAULT_POLICY_JSON, enabled: true })}>
              <span>Reset to defaults</span>
            </button>
          </div>
        </div>
        <aside className="panel db-editor-r">
          <Eyebrow>The context / preview</Eyebrow>
          <h3 className="h5 ink">Where this policy sits on {symbol}.</h3>
          <p className="mono-s soft">
            Hoax acts when health falls to the trigger, and closes in steps until it reaches the target.
            {position ? " The fill is this position's health now." : ""}
          </p>
          <div className="panel-in">
            <HealthField
              health={position?.health ?? null}
              trigger={num(form.triggerHealth, DEFAULT_POLICY_JSON.triggerHealth)}
              target={num(form.targetHealth, DEFAULT_POLICY_JSON.targetHealth)}
            />
          </div>
        </aside>
      </section>
    </>
  );
}
