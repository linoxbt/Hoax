"use client";
// The demo's controlled comparison, labelled as a replay: two identical
// accounts through one mark path, one protected by Hoax. Data comes from
// demo/replay.ts, which runs the real Hoax engine on a simulated venue.

import { useEffect, useState } from "react";

interface Side { health: number | null; equity: number; size: number }
interface Replay {
  label: string;
  note: string;
  market: string;
  params: { maintenanceMarginBps: number; penaltyBps: number; minSpreadBps: number; policy: { trigger: number; target: number } };
  start: { mark: number; collateral: number; size: number };
  result: {
    withoutHoax: { liquidated: boolean; finalEquity: number; finalSize: number };
    withHoax: { liquidated: boolean; finalEquity: number; finalSize: number };
    equityDifference: number;
  };
  receipts: Array<{ outcome: string; closed: number; healthBefore: number; healthAfter: number | null; cost: number; preserved: string | null }>;
  frames: Array<{ t: number; mark: number; with: Side; without: Side; events: string[] }>;
}

const W = 600;
const H = 180;

function Chart({ r }: { r: Replay }) {
  const n = r.frames.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const maxH = Math.max(3, r.params.policy.target + 1);
  const y = (h: number | null) => H - (Math.min(maxH, Math.max(0, h ?? maxH)) / maxH) * H;
  const line = (pick: (f: Replay["frames"][number]) => number | null) => r.frames.map((f, i) => `${x(i).toFixed(1)},${y(pick(f)).toFixed(1)}`).join(" ");
  const hline = (h: number, color: string, label: string) => (
    <g>
      <line x1={0} x2={W} y1={y(h)} y2={y(h)} stroke={color} strokeDasharray="4 4" strokeWidth={1} />
      <text x={4} y={y(h) - 4} fontSize={11} fill="var(--muted)">{label}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Health of both accounts over the replay">
      {hline(1, "var(--missed)", "1.0 liquidation")}
      {hline(r.params.policy.trigger, "var(--skipped)", `trigger ${r.params.policy.trigger}`)}
      {hline(r.params.policy.target, "var(--saved)", `target ${r.params.policy.target}`)}
      <polyline points={line((f) => f.without.health)} fill="none" stroke="var(--missed)" strokeWidth={2} />
      <polyline points={line((f) => f.with.health)} fill="none" stroke="var(--saved)" strokeWidth={2.5} />
    </svg>
  );
}

export default function ReplayPage() {
  const [r, setR] = useState<Replay | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch("/replay.json").then(
      async (res) => (res.ok ? setR((await res.json()) as Replay) : setMissing(true)),
      () => setMissing(true),
    );
  }, []);

  if (missing) return <p>No replay yet. Run <code>npm run replay</code> and reload.</p>;
  if (!r) return null;
  const events = r.frames.flatMap((f, i) => f.events.map((e) => ({ t: Math.round((f.t - r.frames[0].t) / 1000), mark: f.mark, e, i })));
  const saved = r.receipts.find((x) => x.outcome === "saved");
  return (
    <div className="stack">
      <div className="notice info">
        <strong>Replay.</strong> {r.label}. {r.note}
      </div>
      <h1>Same market, same moment, two outcomes</h1>
      <p className="muted">
        Two accounts, each {r.start.size} {r.market.replace("-PERP", "")} long from {r.start.mark.toFixed(2)} on {r.start.collateral} USDso.
        Hoax protects the green one (act at {r.params.policy.trigger}, restore {r.params.policy.target}).
      </p>
      <div className="grid cols-2">
        <div className="card" style={{ borderColor: "var(--missed)" }}>
          <h3>Without Hoax</h3>
          <div className="stat">
            <div className="value">{r.result.withoutHoax.finalEquity.toFixed(2)} USDso</div>
            <div className="label">{r.result.withoutHoax.liquidated ? "liquidated" : "survived"} · {r.result.withoutHoax.finalSize.toFixed(4)} left</div>
          </div>
        </div>
        <div className="card" style={{ borderColor: "var(--saved)" }}>
          <h3>With Hoax</h3>
          <div className="stat">
            <div className="value">{r.result.withHoax.finalEquity.toFixed(2)} USDso</div>
            <div className="label">{r.result.withHoax.liquidated ? "liquidated" : "survived"} · {r.result.withHoax.finalSize.toFixed(4)} left</div>
          </div>
        </div>
      </div>
      <div className="card">
        <Chart r={r} />
        <p className="small muted">Health (equity over maintenance margin). Red: without Hoax. Green: with Hoax.</p>
      </div>
      <div className="card">
        <h3>What happened</h3>
        {events.map((ev) => (
          <p key={`${ev.i}-${ev.e}`} className="small mono">
            t+{ev.t}s · mark {ev.mark.toFixed(2)} · {ev.e}
          </p>
        ))}
      </div>
      <div className="card">
        <h3>The receipts</h3>
        {r.receipts.map((x, i) => (
          <p key={i} className="small">
            <span className={`badge ${x.outcome}`}>{x.outcome}</span> closed {x.closed.toFixed(4)}, health {x.healthBefore.toFixed(3)} →{" "}
            {x.healthAfter?.toFixed(3)}, cost {x.cost.toFixed(4)} USDso
            {x.preserved ? `, equity preserved ${(Number(BigInt(x.preserved)) / 1e18).toFixed(2)} USDso` : ""}
          </p>
        ))}
        <p className="small muted">
          Measured at the end of the path, the protected account holds {r.result.equityDifference.toFixed(2)} USDso more than
          its twin. {saved ? "The receipt's equity-preserved figure is the counterfactual method the live receipts use, taken when the mark reached the old liquidation price." : ""}
        </p>
      </div>
    </div>
  );
}
