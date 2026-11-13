"use client";
// The demo's controlled comparison, labelled as a replay: two identical
// accounts through one mark path, one protected by Hoax. Data comes from
// demo/replay.ts, which runs the real Hoax engine on a simulated venue.

import { useEffect, useState } from "react";
import { PageHead } from "@/components/Kicker";
import { Btn, Eyebrow } from "@/components/Ui";

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

function Field({ frames, pick, trigger, target, label, height = 220 }: { frames: Replay["frames"]; pick: (f: Replay["frames"][number]) => number | null; trigger: number; target: number; label: string; height?: number }) {
  const maxH = Math.max(3, target + 1);
  const n = frames.length;
  const step = 3;
  const y = (h: number) => 100 - (Math.min(maxH, Math.max(0, h)) / maxH) * 100;
  const lines: Array<[number, string, string]> = [
    [1, "1.00 liquidation", "liq"],
    [trigger, `${trigger.toFixed(2)} trigger`, "trig"],
    [target, `${target.toFixed(2)} target`, "tgt"],
  ];
  // Labels keep at least one line of space between them, however close the lines are.
  const gap = (15 / height) * 100;
  const labelTops: Array<[number, string, string]> = [];
  for (const [h, l, c] of lines) {
    const prev = labelTops[labelTops.length - 1];
    labelTops.push([prev ? Math.min(y(h), prev[0] - gap) : y(h), l, c]);
  }
  return (
    <div className="pg-field">
      <svg viewBox={`0 0 ${n * step} 100`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height }} role="img" aria-label={label}>
        {frames.map((f, i) => {
          const h = pick(f) ?? maxH;
          const top = y(h);
          return <rect key={i} x={i * step} y={top} width={1.7} height={100 - top} fill={h < 1.05 ? "var(--bad)" : "currentColor"} opacity={h < 1.05 ? 1 : 0.85} />;
        })}
        {lines.map(([h, , c]) => (
          <line key={c} x1={0} x2={n * step} y1={y(h)} y2={y(h)} stroke={c === "liq" ? "var(--bad)" : "var(--ink)"} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {labelTops.map(([top, l, c]) => (
        <span key={c} className={`pg-field-l ${c}`} style={{ top: `${top}%` }}>
          {l}
        </span>
      ))}
    </div>
  );
}

type View = "both" | "without" | "with";

export default function ReplayPage() {
  const [r, setR] = useState<Replay | null>(null);
  const [missing, setMissing] = useState(false);
  const [view, setView] = useState<View>("both");
  useEffect(() => {
    fetch("/replay.json").then(
      async (res) => (res.ok ? setR((await res.json()) as Replay) : setMissing(true)),
      () => setMissing(true),
    );
  }, []);

  if (missing)
    return (
      <section className="card pg-center">
        <p className="txt">No replay yet. Run npm run replay and reload.</p>
      </section>
    );
  if (!r) return <section className="card pg-explorer pg-wait" aria-busy="true" />;
  const events = r.frames.flatMap((f, i) => f.events.map((e) => ({ t: Math.round((f.t - r.frames[0].t) / 1000), mark: f.mark, e, i })));
  const saved = r.receipts.find((x) => x.outcome === "saved");
  const sides = [
    { key: "without" as const, title: "Without Hoax", res: r.result.withoutHoax },
    { key: "with" as const, title: "With Hoax", res: r.result.withHoax },
  ];
  const shown = view === "both" ? sides : sides.filter((s) => s.key === view);
  const base = r.market.replace("-PERP", "");
  const tabs: Array<[View, string]> = [
    ["both", "Side by side"],
    ["without", "Without Hoax"],
    ["with", "With Hoax"],
  ];
  return (
    <>
      <PageHead
        kicker="Replay · not a live run"
        title="Same crash. Two outcomes."
        sub={
          <>
            {r.start.size} {base} long from {r.start.mark.toFixed(0)} on {r.start.collateral} USDso, through the same mark path.
            Live dreamDEX parameters, <b>the real Hoax engine</b>, a simulated venue.
          </>
        }
        actions={[{ href: "/how-it-works", label: "How it works", ink: true }]}
      />

      {/* the explorer: tabs on top, chart left, context right */}
      <section className="card pg-explorer" data-reveal>
        <div className="pg-card-head">
          <div className="h4">Replay explorer</div>
          <span className="mono-xs muted">SIMULATION · NOT A LIVE RUN</span>
        </div>
        <div className="seg" role="tablist" aria-label="Which account to show">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="pg-explorer-body">
          <div className="pg-charts">
            {shown.map((s) => (
              <div key={s.key} className="pg-chart">
                <div className="between">
                  <div className="h5 ink">
                    {base} / {s.title}
                  </div>
                  <span className={`mono-s ${s.res.liquidated ? "bad" : "good"}`}>{s.res.liquidated ? "Liquidated" : "Survived"}</span>
                </div>
                <div style={{ marginTop: "1.6rem", color: s.key === "with" ? "var(--blue)" : "var(--muted)" }}>
                  <Field
                    frames={r.frames}
                    pick={(f) => f[s.key].health}
                    trigger={r.params.policy.trigger}
                    target={r.params.policy.target}
                    label={`Health of the account ${s.title.toLowerCase()} over the replay`}
                    height={view === "both" ? 150 : 300}
                  />
                  <div className="between mono-xs soft" style={{ marginTop: "0.8rem" }}>
                    <span>start</span>
                    <span>health · 1 bar / s</span>
                    <span>end</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <aside className="panel pg-context">
            <span className="eyebrow">The context</span>
            <div className="h4 ink">{r.label}</div>
            <div className="pg-context-sides">
              {shown.map((s) => (
                <div key={s.key} className="panel-in">
                  <span className={`mono-s ${s.key === "with" ? "accent" : "soft"}`}>{s.title}</span>
                  <div className={`num s${s.key === "with" ? " accent" : ""}`}>
                    {s.res.finalEquity.toFixed(2)}
                    <small>USDso</small>
                  </div>
                  <div className="mono-s" style={{ color: s.res.liquidated ? "var(--bad)" : "var(--ok)" }}>
                    {s.res.liquidated ? "liquidated" : "survived"} · {s.res.finalSize.toFixed(4)} left
                  </div>
                </div>
              ))}
            </div>
            <p className="pg-context-note">{r.note}</p>
            <div>
              <Btn href="/how-it-works" sm>
                How it works
              </Btn>
            </div>
          </aside>
        </div>
      </section>

      {/* what happened and the receipts */}
      <section className="sp pg-two">
        <div className="card pg-events" data-reveal>
          <Eyebrow>The tape / Event by event</Eyebrow>
          <div className="h3">What happened</div>
          <div className="rows">
            {events.map((ev) => (
              <div className="r" key={`${ev.i}-${ev.e}`}>
                <span>
                  t+{ev.t}s · {ev.mark.toFixed(2)}
                </span>
                <span className={ev.e.startsWith("with Hoax") ? "accent" : ""}>{ev.e}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dark pg-proof" data-reveal style={{ ["--d" as string]: "0.08s" }}>
          <Eyebrow>Difference / Equity kept</Eyebrow>
          <div className="num pg-diff">
            +{r.result.equityDifference.toFixed(2)}
            <small>USDso</small>
          </div>
          <p className="txt">Equity kept versus the unprotected account{saved ? ", and the receipt is marked saved" : ""}.</p>
          <div className="pg-proof-in">
            <span className="eyebrow">The receipts</span>
            {r.receipts.map((x, i) => (
              <div className="pg-proof-r" key={i}>
                <span className={`tag ${x.outcome}`}>{x.outcome}</span>
                <span>
                  closed {x.closed.toFixed(4)} · health {x.healthBefore.toFixed(3)} → {x.healthAfter?.toFixed(3)} · cost {x.cost.toFixed(4)} USDso
                  {x.preserved ? ` · preserved ${(Number(BigInt(x.preserved)) / 1e18).toFixed(2)} USDso` : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="pg-proof-act">
            <Btn href="/stats" white>
              See the track record
            </Btn>
          </div>
        </div>
      </section>
    </>
  );
}
