"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHead } from "@/components/AppHead";
import { HealthField } from "@/components/HealthField";
import { Btn, CornerLink, Eyebrow } from "@/components/Ui";
import { useApp, DEFAULT_POLICY_JSON } from "@/lib/appContext";
import { units, usd } from "@/lib/format";
import { positionTag } from "@/lib/protection";
import { useHoax } from "@/lib/wallet";

export default function PositionDetail() {
  const { market } = useParams<{ market: string }>();
  const symbol = decodeURIComponent(market);
  const { view } = useApp();
  const { engine } = useHoax();
  const p = view?.positions.find((x) => x.market === symbol);
  const saved = view?.policies.find((x) => x.market === symbol);
  const policy = saved ?? { ...DEFAULT_POLICY_JSON, market: symbol };

  if (view && !p)
    return (
      <>
        <AppHead kicker="Position" title={symbol} />
        <div className="card db-empty">
          <p className="txt">No open {symbol} position on this wallet.</p>
          <CornerLink href="/app/positions">All positions</CornerLink>
        </div>
      </>
    );

  const tag = view ? positionTag(view, engine, saved) : null;

  return (
    <>
      <AppHead kicker={p ? `${p.side} · ${units(p.size.replace("-", ""), p.baseDecimals)} ${p.baseSymbol}` : "Position"} title={symbol}>
        {tag && <span className={`tag ${tag.cls}`}>{tag.text}</span>}
        <Btn href={`/app/positions/${symbol}/policy`} fill>
          Edit policy
        </Btn>
      </AppHead>
      {p && (
        <>
          <section className="card db-explorer">
            <div className="db-card-h">
              <h2 className="h5">Health</h2>
              <span className="db-label">{p.source === "chain" ? "live" : "last reading"}</span>
            </div>
            <div className="db-explorer-in">
              <div className="db-explorer-l">
                <div className="db-big">
                  <b className="num accent">{p.health === null ? "–" : p.health.toFixed(3)}</b>
                  <span className="mono-s soft">equity ÷ maintenance requirement</span>
                </div>
                <HealthField health={p.health} trigger={policy.triggerHealth} target={policy.targetHealth} />
              </div>
              <div className="panel db-explorer-r">
                <Eyebrow>The market / {symbol}</Eyebrow>
                <div className="rows db-rows">
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
            </div>
          </section>

          <section className="dark db-policy">
            <div className="db-policy-l">
              <Eyebrow>The policy / {saved ? "saved" : "defaults"}</Eyebrow>
              <h2 className="h3">
                Acts at {policy.triggerHealth}.
                <br />
                Restores {policy.targetHealth}.
              </h2>
              <Btn href={`/app/positions/${symbol}/policy`} white>
                Edit policy
              </Btn>
            </div>
            <div className="db-policy-r">
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
          </section>
          <div className="db-back">
            <Link href="/app/positions" className="corner-link ink">
              <span>← All positions</span>
            </Link>
          </div>
        </>
      )}
    </>
  );
}
