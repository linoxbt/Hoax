"use client";
import Link from "next/link";
import { AppHead } from "@/components/AppHead";
import { HealthField } from "@/components/HealthField";
import { Eyebrow } from "@/components/Ui";
import { useApp, DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { units, usd } from "@/lib/format";
import { positionTag } from "@/lib/protection";
import { useHoax } from "@/lib/wallet";

export default function Positions() {
  const { view } = useApp();
  const { engine } = useHoax();
  const n = view?.positions.length ?? 0;
  return (
    <>
      <AppHead kicker={`Your positions / ${view ? `${n} ${n === 1 ? "market" : "markets"}` : "–"}`} title="Positions" />
      {view && view.positions.length === 0 && <p className="card db-empty">No open perp positions on this wallet.</p>}
      <div className="db-plist">
        {view?.positions.map((p) => {
          const saved = view.policies.find((x) => x.market === p.market);
          const policy = saved ?? { ...DEFAULT_POLICY_JSON, market: p.market };
          const tag = positionTag(view, engine, saved);
          return (
            <Link key={p.market} href={`/app/positions/${p.market}`} className="card db-prow">
              <div className="db-prow-id">
                <Eyebrow tone="soft">
                  {p.side} · {units(p.size.replace("-", ""), p.baseDecimals)} {p.baseSymbol} · mark {usd(p.mark)}
                </Eyebrow>
                <h2 className="h4">{p.market}</h2>
                <div className="row">
                  {tag && <span className={`tag ${tag.cls}`}>{tag.text}</span>}
                  {p.markOk ? null : <span className="tag missed">mark stale</span>}
                </div>
              </div>
              <div className="panel db-prow-g">
                <HealthField health={p.health} trigger={policy.triggerHealth} target={policy.targetHealth} />
              </div>
              <div className="db-prow-n">
                <span>Health</span>
                <b className="num m accent">{p.health === null ? "–" : p.health.toFixed(2)}</b>
                <span className="go">
                  Details <span aria-hidden>→</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
