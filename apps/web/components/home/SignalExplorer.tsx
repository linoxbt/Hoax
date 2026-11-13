"use client";
// The signal explorer: switch markets to see a day of liquidations and the context
// around them. Every figure comes from the server's Radar snapshot.
import Link from "next/link";
import { useState } from "react";
import { Arrow } from "../Ui";
import { AreaChart } from "./AreaChart";

export interface ExplorerMarket {
  key: string;
  base: string;
  net: string;
  values: number[];
  labels: string[];
  count: number;
  notional: string;
  cost: string;
  /** Today against the 7-day daily pace, or null when there is no baseline. */
  ratio: number | null;
}

export function SignalExplorer({ markets }: { markets: ExplorerMarket[] }) {
  const [i, setI] = useState(0);
  const m = markets[i];
  if (!m) return null;
  const hot = m.ratio != null && m.ratio >= 1.5;
  return (
    <div className="card hx">
      <div className="between">
        <span className="h4">Signal explorer</span>
        <span className="eyebrow soft">Live data · last 24 hours</span>
      </div>
      <div className="seg hx-tabs" role="tablist" aria-label="Markets">
        {markets.map((x, j) => (
          <button key={x.key} role="tab" aria-selected={j === i} className={j === i ? "on" : ""} onClick={() => setI(j)}>
            {x.base}
          </button>
        ))}
      </div>
      <div className="hx-body">
        <div className="hx-chart">
          <div className="between" style={{ alignItems: "baseline" }}>
            <span className="h4">
              {m.base} / {m.net}
            </span>
            <span className={`hx-state${hot ? " hot" : ""}`}>{hot ? "Elevated activity" : "Within its usual range"}</span>
          </div>
          <AreaChart key={m.key} id={`hx-${m.key}`} values={m.values} labels={m.labels} height={220} />
        </div>
        <div className="panel hx-ctx">
          <span className="eyebrow">The context</span>
          <span className="h4">{hot ? "A market worth watching." : "A quieter day for this market."}</span>
          <p className="txt">
            {m.count} liquidation{m.count === 1 ? "" : "s"} in the last 24 hours: {m.notional} USDso closed by the engine, and at least {m.cost} USDso
            lost to its penalty and forced spread.
            {m.ratio != null && ` That is ${m.ratio.toFixed(1)}× this market's daily pace over the past week.`}
          </p>
          <Link className="btn ghost sm" href="/radar">
            See every liquidation
            <Arrow />
          </Link>
        </div>
      </div>
    </div>
  );
}
