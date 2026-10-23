"use client";
// The demo's controlled comparison, labelled as a replay: two identical
// accounts through one mark path, one protected by Hoax. Data comes from
// demo/replay.ts, which runs the real Hoax engine on a simulated venue.

import { useEffect, useState } from "react";
import { Kicker } from "@/components/Kicker";

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
      <section className="sec alt">
        <div className="wrap pad copy">No replay yet. Run npm run replay and reload.</div>
      </section>
    );
  if (!r) return <section className="sec alt" style={{ minHeight: "60vh" }} />;
  const events = r.frames.flatMap((f, i) => f.events.map((e) => ({ t: Math.round((f.t - r.frames[0].t) / 1000), mark: f.mark, e, i })));
  const saved = r.receipts.find((x) => x.outcome === "saved");
  const sides = [
    { key: "without" as const, title: "Without Hoax", res: r.result.withoutHoax, cls: "" },
    { key: "with" as const, title: "With Hoax", res: r.result.withHoax, cls: "alt" },
  ];
  return (
    <>
      <section className="sec alt">
        <div className="wrap pad" style={{ paddingBottom: 40 }}>
          <Kicker>Replay · not a live run</Kicker>
          <h1 className="hero-in">Same crash. Two outcomes.</h1>
          <p className="lede hero-in" style={{ marginTop: 24, maxWidth: 680, ["--d" as string]: "0.3s" }}>
            {r.start.size} {r.market.replace("-PERP", "")} long from {r.start.mark.toFixed(0)} on {r.start.collateral} USDso. Live dreamDEX
            parameters, simulated venue.
          </p>
        </div>
      </section>
      <div className="grid g2" style={{ gap: 0 }} data-reveal>
        {sides.map((s) => (
          <section key={s.key} className={`sec ${s.cls}`}>
            <div className="pad-s" style={{ padding: "48px var(--gutter)" }}>
              <div className="cap soft">{s.title}</div>
              <div className={`num${s.key === "with" ? " accent" : ""}`} style={{ marginTop: 12 }}>
                {s.res.finalEquity.toFixed(2)}
                <small>USDso</small>
              </div>
              <div className="cap" style={{ marginTop: 12 }}>
                {s.res.liquidated ? "liquidated" : "survived"} · {s.res.finalSize.toFixed(4)} left
              </div>
              <div style={{ marginTop: 32, color: s.key === "with" ? "var(--indigo)" : "var(--ink-soft)" }}>
                <Field frames={r.frames} pick={(f) => f[s.key].health} trigger={r.params.policy.trigger} target={r.params.policy.target} label={`Health of the account ${s.title.toLowerCase()} over the replay`} />
                <div className="spread cap soft" style={{ marginTop: 6 }}>
                  <span>start</span>
                  <span>health · 1 bar / s</span>
                  <span>end</span>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
      <section className="sec">
        <div className="wrap pad">
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <Kicker>Difference</Kicker>
              <div className="num">
                +{r.result.equityDifference.toFixed(2)}
                <small>USDso</small>
              </div>
              <p className="cap soft" style={{ marginTop: 20 }}>
                Equity kept vs. the unprotected account{saved ? " · receipt marked saved" : ""}
              </p>
            </div>
            <div>
              <h3 style={{ marginBottom: 12 }}>What happened</h3>
              <div className="rows">
                {events.map((ev) => (
                  <div className="r" key={`${ev.i}-${ev.e}`}>
                    <span>
                      t+{ev.t}s · {ev.mark.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 12 }}>{ev.e}</span>
                  </div>
                ))}
              </div>
              <h3 style={{ margin: "36px 0 12px" }}>The receipts</h3>
              <div className="rows">
                {r.receipts.map((x, i) => (
                  <div className="r" key={i}>
                    <span className={`tag ${x.outcome}`}>{x.outcome}</span>
                    <span style={{ fontSize: 12 }}>
                      closed {x.closed.toFixed(4)} · health {x.healthBefore.toFixed(3)} → {x.healthAfter?.toFixed(3)} · cost {x.cost.toFixed(4)} USDso
                      {x.preserved ? ` · preserved ${(Number(BigInt(x.preserved)) / 1e18).toFixed(2)} USDso` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
