"use client";
// The demo's controlled comparison, labelled as a replay: two identical
// accounts through one mark path, one protected by Hoax. Data comes from
// demo/replay.ts, which runs the real Hoax engine on a simulated venue.

import { useEffect, useState } from "react";
import { PageHead } from "@/components/Kicker";

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

function Field({ frames, pick, trigger, target, label }: { frames: Replay["frames"]; pick: (f: Replay["frames"][number]) => number | null; trigger: number; target: number; label: string }) {
  const maxH = Math.max(3, target + 1);
  const n = frames.length;
  const step = 3;
  const y = (h: number) => 100 - (Math.min(maxH, Math.max(0, h)) / maxH) * 100;
  return (
    <svg viewBox={`0 0 ${n * step} 100`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 200 }} role="img" aria-label={label}>
      {frames.map((f, i) => {
        const h = pick(f) ?? maxH;
        const top = y(h);
        return <rect key={i} x={i * step} y={top} width={1.7} height={100 - top} fill="currentColor" opacity={h < 1.05 ? 1 : 0.85} />;
      })}
      {[1, trigger, target].map((h) => (
        <line key={h} x1={0} x2={n * step} y1={y(h)} y2={y(h)} stroke="currentColor" strokeWidth={0.4} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      ))}
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

  if (missing)
    return (
      <section className="sec first">
        <div className="pad txt">No replay yet. Run npm run replay and reload.</div>
      </section>
    );
  if (!r) return <section className="sec first" style={{ minHeight: "60vh" }} />;
  const events = r.frames.flatMap((f, i) => f.events.map((e) => ({ t: Math.round((f.t - r.frames[0].t) / 1000), mark: f.mark, e, i })));
  const saved = r.receipts.find((x) => x.outcome === "saved");
  const sides = [
    { key: "without" as const, title: "Without Hoax", res: r.result.withoutHoax },
    { key: "with" as const, title: "With Hoax", res: r.result.withHoax },
  ];
  return (
    <>
      <PageHead
        kicker="Replay · not a live run"
        title="Same crash. Two outcomes."
        sub={
          <>
            {r.start.size} {r.market.replace("-PERP", "")} long from {r.start.mark.toFixed(0)} on {r.start.collateral} USDso, through the same mark path.
            Live dreamDEX parameters, <b>the real Hoax engine</b>, a simulated venue.
          </>
        }
        actions={[{ href: "/how-it-works", label: "How it works", ink: true }]}
      />
      <section className="sec cells c2" data-reveal>
        {sides.map((s) => (
          <div key={s.key} className="p">
            <div className={`mono-s ${s.key === "with" ? "accent" : "soft"}`}>{s.title}</div>
            <div className={`num${s.key === "with" ? " accent" : ""}`} style={{ marginTop: "2.4rem" }}>
              {s.res.finalEquity.toFixed(2)}
              <small>USDso</small>
            </div>
            <div className="mono-s" style={{ marginTop: "1.2rem", color: s.res.liquidated ? "var(--bad)" : "var(--ok)" }}>
              {s.res.liquidated ? "liquidated" : "survived"} · {s.res.finalSize.toFixed(4)} left
            </div>
            <div style={{ marginTop: "3.2rem", color: s.key === "with" ? "var(--brand)" : "var(--ink-4)" }}>
              <Field frames={r.frames} pick={(f) => f[s.key].health} trigger={r.params.policy.trigger} target={r.params.policy.target} label={`Health of the account ${s.title.toLowerCase()} over the replay`} />
              <div className="between mono-xs soft" style={{ marginTop: "0.8rem" }}>
                <span>start</span>
                <span>health · 1 bar / s</span>
                <span>end</span>
              </div>
            </div>
          </div>
        ))}
      </section>
      <section className="sec cells c-why">
        <div className="p">
          <div className="mono-s ink">What happened</div>
          <div className="rows" style={{ marginTop: "2.4rem" }}>
            {events.map((ev) => (
              <div className="r" key={`${ev.i}-${ev.e}`}>
                <span>
                  t+{ev.t}s · {ev.mark.toFixed(2)}
                </span>
                <span style={{ fontSize: "1.3rem" }}>{ev.e}</span>
              </div>
            ))}
          </div>
          <div className="mono-s ink" style={{ marginTop: "4.8rem" }}>
            The receipts
          </div>
          <div className="rows" style={{ marginTop: "2.4rem" }}>
            {r.receipts.map((x, i) => (
              <div className="r" key={i}>
                <span className={`tag ${x.outcome}`}>{x.outcome}</span>
                <span style={{ fontSize: "1.3rem" }}>
                  closed {x.closed.toFixed(4)} · health {x.healthBefore.toFixed(3)} → {x.healthAfter?.toFixed(3)} · cost {x.cost.toFixed(4)} USDso
                  {x.preserved ? ` · preserved ${(Number(BigInt(x.preserved)) / 1e18).toFixed(2)} USDso` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="p stat-cell" style={{ justifyContent: "flex-start", gap: "2.4rem" }}>
          <div className="mono-s soft">Difference</div>
          <div className="num accent">
            +{r.result.equityDifference.toFixed(2)}
            <small>USDso</small>
          </div>
          <p className="txt">Equity kept versus the unprotected account{saved ? ", and the receipt is marked saved" : ""}.</p>
        </div>
      </section>
    </>
  );
}
