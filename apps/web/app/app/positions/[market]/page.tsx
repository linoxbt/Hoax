"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHead } from "@/components/AppHead";
import { HealthField } from "@/components/HealthField";
import { useApp, DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { units, usd } from "@/lib/format";

export default function PositionDetail() {
  const { market } = useParams<{ market: string }>();
  const symbol = decodeURIComponent(market);
  const { view } = useApp();
  const p = view?.positions.find((x) => x.market === symbol);
  const saved = view?.policies.find((x) => x.market === symbol);
  const policy = saved ?? { ...DEFAULT_POLICY_JSON, market: symbol };

  if (view && !p)
    return (
      <>
        <AppHead kicker="Position" title={symbol} />
        <div className="wrap pad-s">
          <p className="copy soft">No open {symbol} position on this wallet. <Link href="/app/positions" className="accent">All positions →</Link></p>
        </div>
      </>
    );

  return (
    <>
      <AppHead kicker={p ? `${p.side} · ${units(p.size.replace("-", ""), p.baseDecimals)} ${p.baseSymbol}` : "Position"} title={symbol}>
        <div className="row">
          {saved?.enabled ? <span className="tag saved">protected</span> : <span className="tag not-needed">not protected</span>}
          <Link href={`/app/positions/${symbol}/policy`} className="pill">
            Edit policy
          </Link>
        </div>
      </AppHead>
      {p && (
        <div className="wrap pad-s">
          <div className="spread">
            <div>
              <div className="cap soft">Health</div>
              <div className="num accent">{p.health === null ? "–" : p.health.toFixed(3)}</div>
            </div>
            <div className="cap soft" style={{ textAlign: "right" }}>
              {p.source === "chain" ? "live" : "last reading"}
            </div>
          </div>
          <HealthField health={p.health} trigger={policy.triggerHealth} target={policy.targetHealth} />
          <div className="grid g2" style={{ marginTop: 40, gap: 48 }}>
            <div>
              <h3 style={{ marginBottom: 14 }}>Market</h3>
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
                  <span>Equity</span>
                  <span>{usd(p.equity)} USDso</span>
                </div>
                <div className="r">
                  <span>Maintenance requirement</span>
                  <span>{usd(p.mmReq)} USDso</span>
                </div>
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 14 }}>Policy</h3>
              <div className="rows">
                <div className="r">
                  <span>Acts at</span>
                  <span>{policy.triggerHealth}</span>
                </div>
                <div className="r">
                  <span>Restores</span>
                  <span>{policy.targetHealth}</span>
                </div>
                <div className="r">
                  <span>Max close per step</span>
                  <span>{policy.maxClosePct}%</span>
                </div>
                <div className="r">
                  <span>Max slippage</span>
                  <span>{policy.maxSlippageBps} bps</span>
                </div>
                <div className="r">
                  <span>Cooldown</span>
                  <span>{policy.cooldownSec} s</span>
                </div>
                <div className="r">
                  <span>Cost gate λ</span>
                  <span>{policy.lambda}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
