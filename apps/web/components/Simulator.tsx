"use client";
// Two identical leveraged longs through the same crash and partial recovery,
// one with Hoax. The protected side calls sizeClose, the engine's own sizing
// function, at every step, so what you see is what the watcher would do with
// these inputs. Liquidation follows the replay's venue model (demo/replay.ts):
// the engine closes 10% steps at a 50 bps forced spread and takes up to the
// 100 bps penalty out of each step, the parameters read from Hideki.

import { DEFAULT_POLICY, fromFloat, sizeClose, toFloat, type MarketParams } from "@hoax/core";
import { useMemo, useState } from "react";
import { useMarkets } from "./LiveMarkets";

const STEPS = 180;
const COLLATERAL = 100;
const PENALTY = 0.01;
const FORCED_SPREAD = 0.005;
const CLOSE_COST = 0.001;
const MARKET: MarketParams = {
  symbol: "ETH-PERP",
  pool: "0x0000000000000000000000000000000000000000",
  baseDecimals: 18,
  tickSize: 10n ** 16n,
  lotSize: 10n ** 14n,
  minQuantity: 4n * 10n ** 15n,
  maintenanceMarginBps: 250,
  takerFeeBpsTimes1k: 0,
};
const MM = MARKET.maintenanceMarginBps / 10_000;

interface Side {
  health: number[];
  equity: number;
  size: number;
  liquidated: boolean;
  closes: number;
  /** Quote paid to exits: Hoax's close costs, or the liquidation penalty and spread. */
  exitCost: number;
}

/** The replay's shape: a slide to the low, a pause, then 60% of the drop recovered. */
export function crashPath(mark0: number, dropPct: number): number[] {
  const low = 1 - dropPct / 100;
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const f = t < 0.5 ? 1 - (1 - low) * (t / 0.5) : t < 0.65 ? low : low + (1 - low) * 0.6 * ((t - 0.65) / 0.35);
    return mark0 * f;
  });
}

export function simulate(leverage: number, dropPct: number, mark0: number, protect: boolean): Side {
  const path = crashPath(mark0, dropPct);
  let size = (COLLATERAL * leverage) / mark0;
  let cash = COLLATERAL;
  const entry = mark0;
  let liquidated = false;
  let closes = 0;
  let exitCost = 0;
  let lastClose = -999;
  const health: number[] = [];
  const equityAt = (mark: number) => cash + size * (mark - entry);
  const healthAt = (mark: number) => (size > 0 ? equityAt(mark) / (MM * size * mark) : 99);

  path.forEach((mark, i) => {
    if (size <= 0) {
      health.push(99);
      return;
    }
    // The liquidation engine: 10% steps until the account is back over maintenance.
    let guard = 0;
    while (size > 0 && equityAt(mark) < MM * size * mark && guard++ < 60) {
      liquidated = true;
      const step = Math.max(size / 10, Math.min(size, 0.004));
      const q = Math.min(size, step);
      const before = equityAt(mark) - MM * size * mark;
      const fillPx = mark * (1 - FORCED_SPREAD);
      cash += q * (fillPx - entry);
      size -= q;
      exitCost += q * (mark - fillPx);
      const surplus = equityAt(mark) - MM * size * mark - before;
      const cap = PENALTY * q * mark;
      const fee = size <= 0 ? cap : Math.max(0, Math.min(surplus, cap));
      cash -= fee;
      exitCost += fee;
    }
    const h = healthAt(mark);
    if (protect && h <= DEFAULT_POLICY.triggerHealth - DEFAULT_POLICY.triggerMargin && i - lastClose >= 3) {
      const r = sizeClose({
        equity: fromFloat(equityAt(mark)),
        mmReq: fromFloat(MM * size * mark),
        positionSize: fromFloat(size),
        mark: fromFloat(mark),
        market: MARKET,
        policy: DEFAULT_POLICY,
        costRate: CLOSE_COST,
      });
      if (r.kind === "close") {
        const q = Math.min(size, toFloat(r.quantity));
        // The closed slice realises at the mark, minus what the close costs.
        cash += q * (mark - entry) - CLOSE_COST * q * mark;
        exitCost += CLOSE_COST * q * mark;
        size -= q;
        closes++;
        lastClose = i;
      }
    }
    health.push(healthAt(mark));
  });
  return { health, equity: equityAt(path[path.length - 1]), size, liquidated, closes, exitCost };
}

function Curve({ health, color, label }: { health: number[]; color: string; label: string }) {
  const max = 3;
  const w = 3;
  return (
    <svg viewBox={`0 0 ${health.length * w} 100`} preserveAspectRatio="none" className="simcurve" role="img" aria-label={label} style={{ color }}>
      {health.map((h, i) => {
        const v = Math.min(max, Math.max(0, h));
        const top = 100 - (v / max) * 100;
        return <rect key={i} x={i * w} y={top} width={1.8} height={100 - top} fill="currentColor" opacity={h === 0 ? 0 : h < 1.25 ? 1 : 0.8} />;
      })}
      {[1, DEFAULT_POLICY.triggerHealth, DEFAULT_POLICY.targetHealth].map((h) => (
        <line key={h} x1={0} x2={health.length * w} y1={100 - (h / max) * 100} y2={100 - (h / max) * 100} stroke="currentColor" strokeWidth={0.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.6} />
      ))}
    </svg>
  );
}

export function Simulator({ mark = 3000 }: { mark?: number }) {
  const [leverage, setLeverage] = useState(12);
  const [drop, setDrop] = useState(9);
  const bare = useMemo(() => simulate(leverage, drop, mark, false), [leverage, drop, mark]);
  const hoax = useMemo(() => simulate(leverage, drop, mark, true), [leverage, drop, mark]);
  const diff = hoax.equity - bare.equity;

  return (
    <div className="sim">
      <div className="sim-controls">
        <label>
          <span className="cap soft">Leverage</span>
          <b className="num s">{leverage}×</b>
          <input type="range" min={3} max={20} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} aria-label="Leverage" />
        </label>
        <label>
          <span className="cap soft">ETH slide</span>
          <b className="num s">−{drop}%</b>
          <input type="range" min={1} max={20} value={drop} onChange={(e) => setDrop(Number(e.target.value))} aria-label="Price drop" />
        </label>
        <div className="sim-note cap soft">
          {COLLATERAL} USDso long from {mark.toLocaleString(undefined, { maximumFractionDigits: 0 })} · crash, pause, 60% recovery · acts at {DEFAULT_POLICY.triggerHealth}, restores {DEFAULT_POLICY.targetHealth}
        </div>
      </div>
      <div className="grid g2 sim-out">
        <div>
          <div className="cap soft">Without Hoax</div>
          <div className="num m" style={{ marginTop: "0.8rem" }}>
            {bare.equity.toFixed(2)}
            <small>USDso</small>
          </div>
          <div className="cap" style={{ marginTop: "0.6rem", color: bare.liquidated ? "var(--bad)" : "var(--ink-soft)" }}>
            {bare.liquidated ? `liquidated · ${bare.exitCost.toFixed(2)} lost to penalty and spread` : "never liquidated"}
          </div>
          <Curve health={bare.health} color="#9b9ab3" label="Health without Hoax" />
        </div>
        <div>
          <div className="cap accent">With Hoax</div>
          <div className="num m accent" style={{ marginTop: "0.8rem" }}>
            {hoax.equity.toFixed(2)}
            <small>USDso</small>
          </div>
          <div className="cap" style={{ marginTop: "0.6rem", color: hoax.liquidated ? "var(--bad)" : "var(--ok)" }}>
            {hoax.liquidated
              ? "liquidated"
              : hoax.closes > 0
                ? `${hoax.closes} trim${hoax.closes === 1 ? "" : "s"} · ${hoax.exitCost.toFixed(2)} in close costs`
                : "no trim needed"}
          </div>
          <Curve health={hoax.health} color="var(--indigo)" label="Health with Hoax" />
        </div>
      </div>
      <div className="sim-foot">
        <span className="cap soft">Difference</span>
        <span className={`num s ${diff > 0.005 ? "accent" : ""}`}>
          {diff >= 0 ? "+" : ""}
          {diff.toFixed(2)}
          <small>USDso</small>
        </span>
        <span className="cap soft">
          {bare.liquidated && !hoax.liquidated
            ? "liquidation avoided"
            : !bare.liquidated && hoax.closes > 0
              ? "never reached liquidation · the trims were insurance"
              : !bare.liquidated
                ? "safe either way"
                : "too fast for any exit"}
        </span>
      </div>
    </div>
  );
}

/** The simulator, started from ETH's live mark. */
export function LiveSimulator() {
  const { rows } = useMarkets(15_000);
  const eth = rows?.find((m) => m.baseSymbol === "ETH");
  const mark = eth?.mark ? Number(eth.mark) / 1e18 : 3000;
  return <Simulator mark={mark} />;
}
