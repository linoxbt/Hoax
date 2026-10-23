"use client";
import Link from "next/link";
import { AppHead } from "@/components/AppHead";
import { HealthField } from "@/components/HealthField";
import { useApp, DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { units, usd } from "@/lib/format";

export default function Positions() {
  const { view } = useApp();
  return (
    <>
      <AppHead kicker="Positions" title="Every open position" />
      <div className="wrap pad-s">
        {view && view.positions.length === 0 && <p className="copy soft">No open perp positions on this wallet.</p>}
        <div style={{ display: "grid", gap: 20 }}>
          {view?.positions.map((p) => {
            const policy = view.policies.find((x) => x.market === p.market) ?? { ...DEFAULT_POLICY_JSON, market: p.market };
            return (
              <Link key={p.market} href={`/app/positions/${p.market}`} className="card">
                <div className="spread">
                  <div>
                    <div className="cap soft">
                      {p.side} · {units(p.size.replace("-", ""), p.baseDecimals)} {p.baseSymbol} · mark {usd(p.mark)}
                    </div>
                    <h3 style={{ marginTop: 6 }}>{p.market}</h3>
                  </div>
                  <div className="row">
                    {policy.enabled ? <span className="tag saved">protected</span> : <span className="tag not-needed">not protected</span>}
                    <span className="num s accent">{p.health === null ? "–" : p.health.toFixed(2)}</span>
                  </div>
                </div>
                <HealthField health={p.health} trigger={policy.triggerHealth} target={policy.targetHealth} />
                <div className="go" style={{ marginTop: 12 }}>
                  Details and policy →
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
