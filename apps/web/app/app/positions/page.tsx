"use client";
import Link from "next/link";
import { AppHead } from "@/components/AppHead";
import { HealthField } from "@/components/HealthField";
import { useApp, DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { units, usd } from "@/lib/format";
import { positionTag } from "@/lib/protection";
import { useHoax } from "@/lib/wallet";

export default function Positions() {
  const { view } = useApp();
  const { engine } = useHoax();
  return (
    <>
      <AppHead kicker="Positions" title="Positions" />
      <div className="wrap pad-s">
        {view && view.positions.length === 0 && <p className="copy soft">No open perp positions on this wallet.</p>}
        <div style={{ display: "grid", gap: "2rem" }}>
          {view?.positions.map((p) => {
            const saved = view.policies.find((x) => x.market === p.market);
            const policy = saved ?? { ...DEFAULT_POLICY_JSON, market: p.market };
            const tag = positionTag(view, engine, saved);
            return (
              <Link key={p.market} href={`/app/positions/${p.market}`} className="card">
                <div className="spread">
                  <div>
                    <div className="cap soft">
                      {p.side} · {units(p.size.replace("-", ""), p.baseDecimals)} {p.baseSymbol} · mark {usd(p.mark)}
                    </div>
                    <h3 style={{ marginTop: "0.6rem" }}>{p.market}</h3>
                  </div>
                  <div className="row">
                    {tag && <span className={`tag ${tag.cls}`}>{tag.text}</span>}
                    <span className="num s accent">{p.health === null ? "–" : p.health.toFixed(2)}</span>{p.markOk ? null : <span className="tag missed">mark stale</span>}
                  </div>
                </div>
                <HealthField health={p.health} trigger={policy.triggerHealth} target={policy.targetHealth} />
                <div className="go" style={{ marginTop: "1.2rem" }}>
                  Details →
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
