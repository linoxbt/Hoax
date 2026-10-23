"use client";
// The hero drawing: a 12x ETH long as a technical drawing. Drag the price
// handle down and Hoax acts as the watcher would: at the trigger it trims with
// sizeClose (the engine's own function), and the liquidation line falls away
// from the price, while the unprotected twin's line stays where it was.

import { DEFAULT_POLICY, fromFloat, sizeClose, toFloat, type MarketParams } from "@hoax/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const W = 1600;
const H = 640;
const C0 = 100;
const LEV = 12;
const MM = 0.025;
const COST = 0.001;
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

interface Trim {
  price: number;
  qty: number;
  before: number;
  after: number;
}

/** Walk the price from entry down to `p`, trimming as the engine would. */
function protect(p0: number, p: number) {
  const s0 = (C0 * LEV) / p0;
  let size = s0;
  let cash = C0;
  const trims: Trim[] = [];
  let last = -1;
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const mark = p0 + ((p - p0) * i) / steps;
    const eq = cash + size * (mark - p0);
    const mm = MM * size * mark;
    const h = eq / mm;
    if (h <= 1) break;
    if (h <= DEFAULT_POLICY.triggerHealth - DEFAULT_POLICY.triggerMargin && i - last >= 4) {
      const r = sizeClose({ equity: fromFloat(eq), mmReq: fromFloat(mm), positionSize: fromFloat(size), mark: fromFloat(mark), market: MARKET, policy: DEFAULT_POLICY, costRate: COST });
      if (r.kind === "close") {
        const q = Math.min(size, toFloat(r.quantity));
        cash += q * (mark - p0) - COST * q * mark;
        size -= q;
        last = i;
        trims.push({ price: mark, qty: q, before: h, after: (cash + size * (mark - p0)) / (MM * size * mark) });
      }
    }
  }
  const eq = cash + size * (p - p0);
  const health = size > 0 ? eq / (MM * size * p) : Infinity;
  const liq = size > 0 ? (size * p0 - cash) / (size * (1 - MM)) : 0;
  return { trims, size, health, liq, s0 };
}

export function HeroDrawing({ mark = 2400 }: { mark?: number }) {
  const p0 = Math.round(mark);
  const s0 = (C0 * LEV) / p0;
  const liq0 = (s0 * p0 - C0) / (s0 * (1 - MM));
  const trig = (s0 * p0 - C0) / (s0 * (1 - DEFAULT_POLICY.triggerHealth * MM));
  const lo = liq0 - (p0 - liq0) * 0.45;
  const hi = p0 + (p0 - liq0) * 0.22;
  const y = useCallback((p: number) => 70 + ((hi - p) / (hi - lo)) * (H - 140), [hi, lo]);
  const toPrice = useCallback((yy: number) => hi - ((yy - 70) / (H - 140)) * (hi - lo), [hi, lo]);

  const [price, setPrice] = useState(p0 - (p0 - trig) * 0.4);
  const [drag, setDrag] = useState(false);
  const [ptr, setPtr] = useState<{ x: number; y: number } | null>(null);
  const [touched, setTouched] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const set = () => setNarrow(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  // On a phone the drawing zooms onto the live segment and its labels grow to stay legible.
  const vb = narrow ? { x: 700, y: 30, w: 900, h: 600 } : { x: 0, y: 0, w: W, h: H };
  const fs = narrow ? 22 : 11;

  // Before anyone touches it, the handle eases down through the trigger once.
  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = p0 - (p0 - trig) * 0.4;
    const to = liq0 + (trig - liq0) * 0.15;
    let raf = 0;
    const start = performance.now() + 2200;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / 2600));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setPrice(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [touched, p0, trig, liq0]);

  const run = useMemo(() => protect(p0, price), [p0, price]);
  const bareLiquidated = price <= liq0;

  // The recorded part of the chart: deterministic candles drifting around entry.
  const candles = useMemo(() => {
    const out: Array<{ x: number; o: number; c: number; h: number; l: number }> = [];
    // a range that wanders a little above and below entry, then returns to it
    const amp = (p0 - liq0) / p0;
    let v = p0 * (1 + amp * 0.12);
    for (let i = 0; i < 34; i++) {
      const drift = (Math.sin(i * 0.7) * 0.18 + Math.cos(i * 1.9) * 0.12 - (i > 26 ? 0.08 : 0)) * amp;
      const o = v;
      const c = i === 33 ? p0 : v * (1 + drift);
      const hiP = Math.max(o, c) * (1 + amp * (0.05 + (i % 3) * 0.02));
      const loP = Math.min(o, c) * (1 - amp * (0.05 + (i % 4) * 0.015));
      out.push({ x: 90 + i * 26, o, c, h: hiP, l: loP });
      v = c;
    }
    return out;
  }, [p0]);
  const x0 = 90 + 33 * 26;
  const xHandle = 1360;

  const svgPoint = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
  };
  const onMove = (e: React.PointerEvent) => {
    const pt = svgPoint(e);
    setPtr(pt);
    if (drag) setPrice(Math.min(hi - 2, Math.max(lo + 2, toPrice(pt.y))));
  };

  const fmt = (p: number) => p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const segY = (p: number) => y(p);
  const lastTrim = run.trims[run.trims.length - 1];

  return (
    <div className="hero-draw">
      <svg
        ref={svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="hero-svg"
        onPointerMove={onMove}
        onPointerLeave={() => !drag && setPtr(null)}
        onPointerUp={() => setDrag(false)}
        role="img"
        aria-label={`A 12x ETH long. Price ${fmt(price)}. ${run.trims.length} Hoax trims. Liquidation price with Hoax ${fmt(run.liq)}, without ${fmt(liq0)}.`}
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#282828" strokeWidth="1" opacity="0.5" />
          </pattern>
        </defs>

        {/* drafting grid */}
        {Array.from({ length: 17 }, (_, i) => (
          <line key={`v${i}`} x1={i * 100} x2={i * 100} y1={0} y2={H} stroke="#b3b3af" strokeWidth="0.6" opacity="0.35" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1={0} x2={W} y1={i * 100 + 20} y2={i * 100 + 20} stroke="#b3b3af" strokeWidth="0.6" opacity="0.35" />
        ))}

        {/* levels */}
        <g fontFamily="var(--mono)" fontSize={fs} letterSpacing="0">
          <line x1="40" x2="1500" y1={y(p0)} y2={y(p0)} stroke="#282828" strokeWidth="0.8" strokeDasharray="2 5" />
          <text x={narrow ? 1590 : 1508} textAnchor={narrow ? "end" : "start"} y={y(p0) - (narrow ? 8 : -4)} fill="#626260">ENTRY {fmt(p0)}</text>
          <line x1="40" x2="1500" y1={y(trig)} y2={y(trig)} stroke="#282828" strokeWidth="1" strokeDasharray="8 5" />
          <text x={narrow ? 1590 : 1508} textAnchor={narrow ? "end" : "start"} y={y(trig) - (narrow ? 8 : -4)} fill="#282828">ACT · H 1.25</text>
          <line x1="40" x2="1500" y1={y(liq0)} y2={y(liq0)} stroke="#9a9a96" strokeWidth="1" strokeDasharray="3 3" />
          <text x={narrow ? 1590 : 1508} textAnchor={narrow ? "end" : "start"} y={y(liq0) + (narrow ? 26 : 4)} fill="#9a9a96">
            LIQ {fmt(liq0)}
          </text>
          {run.trims.length > 0 && run.liq > 0 && (
            <g style={{ transition: "transform 0.6s" }}>
              <line x1="40" x2="1500" y1={y(Math.max(lo + 4, run.liq))} y2={y(Math.max(lo + 4, run.liq))} stroke="#fa3600" strokeWidth="1.4" />
              <text x={narrow ? 1590 : 1508} textAnchor={narrow ? "end" : "start"} y={y(Math.max(lo + 4, run.liq)) + (narrow ? 26 : 4)} fill="#fa3600">
                LIQ {fmt(run.liq)}
              </text>
            </g>
          )}
        </g>

        {/* the recorded candles */}
        {candles.map((k, i) => {
          const up = k.c >= k.o;
          const top = y(Math.max(k.o, k.c));
          const h = Math.max(2, Math.abs(y(k.o) - y(k.c)));
          return (
            <g key={i} stroke="#282828" strokeWidth="1.2">
              <line x1={k.x} x2={k.x} y1={y(k.h)} y2={y(k.l)} />
              <rect x={k.x - 7} y={top} width="14" height={h} fill={up ? "#f5f5ef" : "url(#hatch)"} />
            </g>
          );
        })}

        {/* the live segment the trader drags */}
        <line x1={x0} y1={y(p0)} x2={xHandle} y2={segY(price)} stroke="#282828" strokeWidth="2" />
        {/* the unprotected twin's fate */}
        {bareLiquidated && (
          <g>
            <circle cx={x0 + ((xHandle - x0) * (p0 - liq0)) / (p0 - price)} cy={y(liq0)} r="9" fill="none" stroke="#9a9a96" strokeWidth="1.2" />
            <text x={x0 + ((xHandle - x0) * (p0 - liq0)) / (p0 - price) - 50} y={y(liq0) + 30} fontFamily="var(--mono)" fontSize={fs} fill="#9a9a96">
              WITHOUT HOAX: LIQUIDATED
            </text>
          </g>
        )}
        {/* Hoax's trims, where the segment crossed the trigger */}
        {run.trims.map((t, i) => {
          const tx = x0 + ((xHandle - x0) * (p0 - t.price)) / (p0 - price);
          return (
            <g key={i}>
              <rect x={tx - 7} y={y(t.price) - 7} width="14" height="14" fill="#fa3600" />
              <text x={tx + 12} y={y(t.price) - 10} fontFamily="var(--mono)" fontSize={fs - 1} fill="#fa3600">
                {String(i + 1).padStart(2, "0")}
              </text>
            </g>
          );
        })}

        {/* the handle */}
        <g
          style={{ cursor: drag ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrag(true);
            setTouched(true);
          }}
        >
          <rect x={xHandle - 22} y={segY(price) - 22} width="44" height="44" fill="transparent" />
          <rect x={xHandle - 8} y={segY(price) - 8} width="16" height="16" fill="#282828" />
          <line x1={xHandle} x2={xHandle} y1={segY(price) - 30} y2={segY(price) + 30} stroke="#282828" strokeWidth="1" />
          <line x1={xHandle - 30} x2={xHandle + 30} y1={segY(price)} y2={segY(price)} stroke="#282828" strokeWidth="1" />
        </g>

        {/* pointer crosshair with coordinates */}
        {ptr && (
          <g pointerEvents="none">
            <line x1={ptr.x} x2={ptr.x} y1={0} y2={H} stroke="#fa3600" strokeWidth="0.8" strokeDasharray="4 4" />
            <line x1={0} x2={W} y1={ptr.y} y2={ptr.y} stroke="#fa3600" strokeWidth="0.8" strokeDasharray="4 4" />
            <rect x={ptr.x - 5} y={ptr.y - 5} width="10" height="10" fill="#fa3600" />
            <text x={ptr.x - 12} y={ptr.y - 22} textAnchor="end" fontFamily="var(--mono)" fontSize={fs} fill="#626260">
              X:{Math.round(ptr.x)}PX
            </text>
            <text x={ptr.x - 12} y={ptr.y - 8} textAnchor="end" fontFamily="var(--mono)" fontSize={fs} fill="#626260">
              {fmt(toPrice(ptr.y))} USD
            </text>
          </g>
        )}
      </svg>

      {/* the dark instruction tag sits by the handle until someone drags */}
      {!touched && (
        <div className="hero-tip tooltip-dark" style={{ left: `${((xHandle - vb.x) / vb.w) * 100}%`, top: `${((segY(price) - vb.y) / vb.h) * 100}%` }}>
          Drag the price
          <br />
          to see Hoax act
        </div>
      )}

      {/* the readout: what the engine did at this price */}
      <div className="hero-readout">
        <div className="tagbox">
          <div className="tagbox-head between">
            <span>{run.trims.length ? "Hoax acted" : "Watching"}</span>
            <span>ETH-PERP · 12×</span>
          </div>
          <div className="tagbox-body">
            <div className="hr-grid">
              <span className="mono-xs soft">Price</span>
              <b>{fmt(price)}</b>
              <span className="mono-xs soft">Health</span>
              <b className={run.health < 1.25 ? "accent" : ""}>{Number.isFinite(run.health) ? run.health.toFixed(2) : "–"}</b>
              <span className="mono-xs soft">Trims</span>
              <b>{run.trims.length}</b>
              <span className="mono-xs soft">Liq. price</span>
              <b>
                {fmt(run.liq)} <span className="soft">vs {fmt(liq0)}</span>
              </b>
            </div>
            {lastTrim && (
              <p className="mono-xs accent" style={{ marginTop: "1rem" }}>
                Last trim {lastTrim.qty.toFixed(4)} ETH · {lastTrim.before.toFixed(2)} → {lastTrim.after.toFixed(2)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
