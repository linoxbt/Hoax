"use client";
// Step 4: when Hoax acts, how far it restores, and how much it may close at once.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StepNav } from "@/components/StepNav";
import { api } from "@/lib/session";
import { useStart } from "@/lib/startContext";

export default function PolicyStep() {
  const router = useRouter();
  const { session, view, linked, setErr } = useStart();
  const [policy, setPolicy] = useState({ triggerHealth: 1.25, targetHealth: 1.6, maxClosePct: 50, maxSlippageBps: 30 });
  const [markets, setMarkets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (view && markets.length === 0) {
      const held = view.positions.map((p) => p.market);
      setMarkets(held.length > 0 ? held : ["ETH-PERP"]);
    }
  }, [view, markets.length]);

  async function turnOn() {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      for (const m of markets) {
        await api(`/api/policies/${session.owner}/${m}`, {
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

  const fields = [
    ["triggerHealth", "Trigger health", "0.05"],
    ["targetHealth", "Target health", "0.05"],
    ["maxClosePct", "Max close per step %", "1"],
    ["maxSlippageBps", "Max slippage bps", "1"],
  ] as const;

  return (
    <div className="grid g-aside" style={{ gap: 48 }}>
      <div>
        <h2>Your policy</h2>
        <p className="copy soft" style={{ marginTop: 20 }}>
          Act at the trigger, restore to the target. Editable per position.
        </p>
      </div>
      <div>
        {!linked ? (
          <p className="copy soft">Link the key first.</p>
        ) : (
          <>
            <div className="cap soft">Markets: {markets.join(", ")}</div>
            <div className="grid g2" style={{ marginTop: 16 }}>
              {fields.map(([k, label, step]) => (
                <label className="field" key={k}>
                  <span>{label}</span>
                  <input type="number" step={step} value={policy[k]} onChange={(e) => setPolicy({ ...policy, [k]: Number(e.target.value) })} />
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: 28 }}>
              <button className="pill" disabled={busy} onClick={turnOn}>
                Turn on Hoax
              </button>
            </div>
          </>
        )}
        <StepNav back="/start/gas" />
      </div>
    </div>
  );
}
