"use client";
// The pinned section: two statements, then a health drawing that builds as you
// scroll (frame, bars, levels, Hoax's trims), then the panel that says how it
// runs. On phones it is a plain stack in its final state.

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Art";

const BARS = Array.from({ length: 64 }, (_, i) => {
  // two slides toward liquidation, each caught at the trigger and lifted to the target
  const t = i / 63;
  let h = 2.6 - 1.6 * Math.max(0, Math.sin(t * Math.PI * 1.05)) + Math.sin(i * 0.9) * 0.06;
  if (i >= 22 && i < 24) h = 1.22;
  if (i >= 24 && i < 30) h = 1.6 + (i - 24) * 0.03;
  if (i >= 41 && i < 43) h = 1.23;
  if (i >= 43) h = Math.max(h, 1.6 + Math.sin((i - 43) * 0.5) * 0.12);
  return h;
});
const TRIMS = [22, 41];

const STAGES = [
  "Every position has a health: equity over maintenance margin. At 1.0 the liquidation engine takes over.",
  "Hoax reads it every second, on every market, and records what it sees.",
  "It acts at the trigger and closes only enough to restore the target.",
  "Each trim is one immediate-or-cancel order through your linked key, with a signed receipt.",
];

const ROWS: Array<[string, "link" | "clock" | "slice" | "sign"]> = [
  ["Links to your dreamDEX account in one transaction.", "link"],
  ["Reads health every second, on all 21 markets.", "clock"],
  ["Closes the smallest slice that restores your target.", "slice"],
  ["Signs a receipt for every action it takes.", "sign"],
];

function clamp(v: number, a = 0, b = 1) {
  return Math.min(b, Math.max(a, v));
}

function Statement({ text, k, dotAt }: { text: string; k: number; dotAt: number }) {
  const chars = text.split("");
  const lit = Math.round(k * chars.length);
  return (
    <div className="statement bu-statement" aria-label={text}>
      {chars.map((ch, i) => (
        <span key={i} style={{ color: i < lit ? "var(--ink)" : "var(--muted)", position: "relative" }}>
          {ch}
          {i === dotAt && <i className="bu-dot" />}
        </span>
      ))}
    </div>
  );
}

function Drawing({ k }: { k: number }) {
  const W = 1200;
  const Hh = 760;
  const max = 3;
  const y = (h: number) => 80 + (1 - h / max) * 560;
  const x = (i: number) => 140 + i * 15.5;
  const s1 = clamp(k / 0.25);
  const s2 = clamp((k - 0.2) / 0.3);
  const s3 = clamp((k - 0.5) / 0.2);
  const s4 = clamp((k - 0.72) / 0.2);
  const shown = Math.round(s2 * BARS.length);
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="bu-svg" aria-hidden>
      <g opacity={s1} stroke="#282828" strokeWidth="1.4" fill="none">
        <rect x="120" y="60" width="1010" height="600" strokeDasharray={`${s1 * 3220} 3220`} />
      </g>
      <g opacity={s1 * 0.8} fontFamily="var(--mono)" fontSize="12" fill="#626260">
        {[0, 1, 2, 3].map((h) => (
          <g key={h}>
            <line x1="112" x2="120" y1={y(h)} y2={y(h)} stroke="#626260" />
            <text x="104" y={y(h) + 4} textAnchor="end">
              {h.toFixed(1)}
            </text>
          </g>
        ))}
        <text x="120" y="700">T+00:00</text>
        <text x="1130" y="700" textAnchor="end">
          T+01:04
        </text>
      </g>
      {BARS.slice(0, shown).map((h, i) => (
        <rect key={i} x={x(i)} y={y(h)} width="9" height={640 - y(h) + 20} fill={h < 1.25 ? "#282828" : "#4a4a48"} opacity={0.9} />
      ))}
      <g opacity={s3}>
        {[
          [1, "LIQUIDATION · 1.00", "#9a9a96", "3 4"],
          [1.25, "ACT · 1.25", "#282828", "10 6"],
          [1.6, "RESTORE · 1.60", "#282828", "2 6"],
        ].map(([h, label, color, dash]) => (
          <g key={label as string}>
            <line x1="120" x2="1130" y1={y(h as number)} y2={y(h as number)} stroke={color as string} strokeWidth="1.2" strokeDasharray={dash as string} />
            <text x="1140" y={y(h as number) + 4} fontFamily="var(--mono)" fontSize="12" fill={color as string}>
              {label}
            </text>
          </g>
        ))}
        <line x1="60" x2="60" y1={y(1)} y2={y(1.6)} stroke="#626260" />
        <line x1="54" x2="66" y1={y(1)} y2={y(1)} stroke="#626260" />
        <line x1="54" x2="66" y1={y(1.6)} y2={y(1.6)} stroke="#626260" />
        <text x="46" y={(y(1) + y(1.6)) / 2} transform={`rotate(-90 46 ${(y(1) + y(1.6)) / 2})`} textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="#626260">
          BUFFER 0.60
        </text>
      </g>
      {TRIMS.map((i, n) => (
        <g key={i} opacity={clamp((s4 - n * 0.4) / 0.6)}>
          <rect x={x(i) - 8} y={y(1.23) - 12} width="24" height="24" fill="#fa3600" />
          <text x={x(i) + 4} y={y(1.23) + 4} textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="#fff">
            {String(n + 1).padStart(2, "0")}
          </text>
          <line x1={x(i) + 4} x2={x(i) + 4} y1={y(1.23) - 12} y2={y(1.6) + 6} stroke="#fa3600" strokeWidth="1.4" />
          <path d={`M${x(i) - 2} ${y(1.6) + 14} L${x(i) + 4} ${y(1.6) + 4} L${x(i) + 10} ${y(1.6) + 14}`} fill="none" stroke="#fa3600" strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  );
}

function Panel({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="bu-panel" style={style}>
      <div className="bu-panel-label mono-s ink">
        Your positions.
        <br />
        Your key.
        <br />
        Connected.
      </div>
      <div className="bu-panel-title">
        <h2 className="h2">Runs natively on dreamDEX</h2>
        <p className="txt" style={{ marginTop: "2rem", maxWidth: "43rem" }}>
          Hoax works through dreamDEX&apos;s own linked-bot permissions. It reads your account where it lives and trades only through the key you link, so
          nothing moves without your say-so.
        </p>
      </div>
      <div className="bu-rows">
        {ROWS.map(([t, ic]) => (
          <div key={t} className="bu-row">
            <span className="txt ink">{t}</span>
            <span className="bu-ic">
              <Icon kind={ic} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BuildUp() {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px), (prefers-reduced-motion: reduce)");
    const setMode = () => setPinned(!mq.matches);
    setMode();
    mq.addEventListener("change", setMode);
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setK(clamp(-r.top / Math.max(1, total)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", setMode);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!pinned) {
    return (
      <section className="sec bu-flat">
        <div className="p" style={{ paddingTop: "8rem", paddingBottom: "8rem", textAlign: "center" }}>
          <Statement text="Before the engine does" k={1} dotAt={9} />
        </div>
        <div className="bt drawing" style={{ padding: "1.6rem" }}>
          <Drawing k={1} />
          <div className="tagbox" style={{ width: "100%", marginTop: "1.6rem" }}>
            <div className="tagbox-head">Introduction</div>
            <div className="tagbox-body">{STAGES.join(" ")}</div>
          </div>
        </div>
        <div className="bt">
          <Panel />
        </div>
      </section>
    );
  }

  const a = clamp(k / 0.12);
  const b = clamp((k - 0.14) / 0.12);
  const draw = clamp((k - 0.22) / 0.6);
  const panel = clamp((k - 0.8) / 0.14);
  const stage = Math.min(STAGES.length - 1, Math.floor(draw * STAGES.length));
  const showStatementA = k < 0.15;
  const showStatementB = k >= 0.15 && k < 0.28;

  return (
    <section className="sec bu" ref={ref}>
      <div className="bu-stick">
        <span className="ruler-x" style={{ top: "1.2rem" }} aria-hidden />
        <span className="ruler-y" style={{ left: "1.2rem" }} aria-hidden />
        <span className="plus tl" aria-hidden />
        <span className="plus tr" aria-hidden />
        <span className="plus bl" aria-hidden />
        <div className="bu-center" style={{ opacity: showStatementA ? 1 : 0 }}>
          <Statement text="Before the engine does" k={a} dotAt={9} />
        </div>
        <div className="bu-center" style={{ opacity: showStatementB ? 1 : 0 }}>
          <Statement text="For every position" k={b} dotAt={6} />
        </div>
        <div className="bu-stage" style={{ opacity: k >= 0.24 ? 1 : 0, transform: `translateX(${-panel * 16}%)` }}>
          <Drawing k={draw} />
        </div>
        <div className="bu-intro" style={{ opacity: k >= 0.24 ? 1 : 0 }}>
          <div className="tagbox">
            <div className="tagbox-head between">
              <span>Introduction</span>
              <span>
                {String(stage + 1).padStart(2, "0")}/{String(STAGES.length).padStart(2, "0")}
              </span>
            </div>
            <div className="tagbox-body">
              {STAGES[stage]}
              <div className="mono-xs muted" style={{ marginTop: "1.2rem" }}>
                [Scroll to continue]
              </div>
            </div>
          </div>
        </div>
        <Panel style={{ transform: `translateX(${(1 - panel) * 101}%)` }} />
      </div>
    </section>
  );
}
