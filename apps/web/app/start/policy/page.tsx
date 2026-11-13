"use client";
// Step 4: when Hoax acts, how far it restores, and how much it may close at once.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StepNav } from "@/components/StepNav";
import { Btn, Eyebrow } from "@/components/Ui";
import { DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { BOUNDS, fromInput, policyProblems, toInput } from "@/lib/policyForm";
import { api } from "@/lib/session";
import { useStart } from "@/lib/startContext";

export default function PolicyStep() {
  const router = useRouter();
  const { session, view, linked, setErr } = useStart();
  const [policy, setPolicy] = useState({ triggerHealth: 1.25, targetHealth: 1.6, maxClosePct: 50, maxSlippageBps: 30 });
  const [markets, setMarkets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const problems = policyProblems({ ...DEFAULT_POLICY_JSON, ...policy, enabled: true });

  useEffect(() => {
    if (view && markets.length === 0) {
      const held = view.positions.map((p) => p.market);
      setMarkets(held.length > 0 ? held : ["ETH-PERP"]);
    }
  }, [view, markets.length]);

  async function turnOn() {
    if (!session || problems.length > 0) return;
    setBusy(true);
    setErr(null);
    // Each market is saved on its own; a failure names the markets still off.
    const done = [...saved];
    try {
      for (const m of markets) {
        if (done.includes(m)) continue;
        await api(`/api/policies/${session.owner}/${m}?chain=${session.chainId}`, {
          method: "PUT",
          token: session.token,
          body: JSON.stringify({ ...policy, enabled: true }),
        });
        done.push(m);
        setSaved([...done]);
      }
      router.push("/app");
    } catch (e) {
      const left = markets.filter((m) => !done.includes(m));
      setErr(`${(e as Error).message}${done.length ? ` (on for ${done.join(", ")}; still off: ${left.join(", ")})` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    ["triggerHealth", "Trigger health", "0.05"],
    ["targetHealth", "Target health", "0.05"],
    ["maxClosePct", "Max close per step %", "1"],
    ["maxSlippageBps", "Max slippage bps", "1"],
  ] as const;
  const show = (n: number, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : "–");

  return (
    <article className="card st-step">
      <div className="st-grid">
        <div className="st-explain">
          <Eyebrow>Step 04 / Policy</Eyebrow>
          <h2 className="h2">Your policy</h2>
          <p className="txt">Act at the trigger, restore to the target. Editable per position.</p>
          {!linked ? (
            <p className="txt">Link the key first.</p>
          ) : (
            <>
              <div className="st-markets">
                <span className="eyebrow soft">Markets:</span>
                {markets.map((m) => (
                  <span key={m} className="st-chip">
                    {m}
                  </span>
                ))}
              </div>
              <div className="st-fields">
                {fields.map(([k, label, step]) => (
                  <label className="field" key={k}>
                    <span>{label}</span>
                    <input
                      type="number"
                      step={step}
                      min={BOUNDS[k]?.min}
                      max={BOUNDS[k]?.max}
                      value={toInput(policy[k])}
                      onChange={(e) => setPolicy({ ...policy, [k]: fromInput(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
              {problems.length > 0 && (
                <ul className="note bad" role="alert">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <div>
                <Btn fill disabled={busy || problems.length > 0} onClick={turnOn}>
                  {busy ? "Saving…" : saved.length > 0 ? "Turn on the rest" : "Turn on Hoax"}
                </Btn>
              </div>
            </>
          )}
        </div>

        <div className="panel st-set" aria-label="Your protection settings">
          <Eyebrow>Your protection settings</Eyebrow>
          <div className="st-set-blk">
            <span className="h4">Trigger at {show(policy.triggerHealth, 2)}</span>
            <p>Act at or below this account health.</p>
          </div>
          <div className="panel-in">
            <span className="h4">Restore to {show(policy.targetHealth, 2)}</span>
            <p>Restore to: the health each protective close aims for.</p>
          </div>
          <div className="st-set-blk">
            <span className="h4">Close up to {show(policy.maxClosePct)}% per step</span>
            <p>Largest single close.</p>
          </div>
          <div className="panel-in">
            <span className="h4">Slippage cap {show(policy.maxSlippageBps)} bps</span>
            <p>Worst fill vs. mark.</p>
          </div>
          <div className="st-set-foot">
            <span className="eyebrow">Applies to</span>
            <span className="mono-s ink">{markets.length > 0 ? markets.join(", ") : "–"}</span>
          </div>
        </div>
      </div>
      <StepNav back="/start/gas" />
    </article>
  );
}
