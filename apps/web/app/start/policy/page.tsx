"use client";
// Step 4: when Hoax acts, how far it restores, and how much it may close at once.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StepNav } from "@/components/StepNav";
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

  return (
    <div className="grid g-aside" style={{ gap: "4.8rem" }}>
      <div>
        <h2>Your policy</h2>
        <p className="copy soft" style={{ marginTop: "2rem" }}>
          Act at the trigger, restore to the target. Editable per position.
        </p>
      </div>
      <div>
        {!linked ? (
          <p className="copy soft">Link the key first.</p>
        ) : (
          <>
            <div className="cap soft">Markets: {markets.join(", ")}</div>
            <div className="grid g2" style={{ marginTop: "1.6rem" }}>
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
              <ul className="note bad" style={{ marginTop: "2rem" }} role="alert">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="row" style={{ marginTop: "2.8rem" }}>
              <button className="pill" disabled={busy || problems.length > 0} onClick={turnOn}>
                {busy ? "Saving…" : saved.length > 0 ? "Turn on the rest" : "Turn on Hoax"}
              </button>
            </div>
          </>
        )}
        <StepNav back="/start/gas" />
      </div>
    </div>
  );
}
