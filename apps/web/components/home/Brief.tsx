"use client";
// The protection brief: one real close on Shannon (receipt 69bdf902), told as
// signal, gate and action, in MarketSnack's navy brief card.
import { useState } from "react";

const STEPS = [
  {
    tab: "Signal",
    k: "01 / The signal",
    title: "Health slips.",
    card: { label: "Account · SOL-PERP · Shannon", head: "Health 1.18.\nUnder the 1.23 line.", foot: "Read every second · trigger 1.25, margin 0.02" },
    note: "Mark, funding and every other position move one number. Hoax reads it each second and acts only once it is clearly under the trigger.",
  },
  {
    tab: "Gate",
    k: "02 / The gate",
    title: "Is acting cheaper?",
    card: { label: "Cost check · live book", head: "0.064 vs 3.69 USDso.\nThe trim may go.", foot: "Close cost against penalty plus forced spread" },
    note: "The smallest close that restores the 1.60 target costs far less than the liquidation it prevents. Hoax sends it only when it costs at most half.",
  },
  {
    tab: "Action",
    k: "03 / The action",
    title: "One order. One receipt.",
    card: { label: "IOC order · signed receipt", head: "0.8 of 2.96 SOL closed.\nHealth 1.18 → 1.60.", foot: "Judged 24 hours later: saved" },
    note: "The liquidation price moved away, the rest of the position stayed open, and the receipt was signed by the account's own Hoax key.",
  },
];

export function Brief() {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <div className="dark hb">
      <div className="between hb-top">
        <span className="eyebrow">Protection brief</span>
        <span className="eyebrow soft">Real close</span>
      </div>
      <div className="seg dark-seg" role="tablist" aria-label="Brief">
        {STEPS.map((x, j) => (
          <button key={x.tab} role="tab" aria-selected={j === i} className={j === i ? "on" : ""} onClick={() => setI(j)}>
            {x.tab}
          </button>
        ))}
      </div>
      <div className="hb-step" key={i}>
        <span className="eyebrow" style={{ color: "var(--blue-300)" }}>
          {s.k}
        </span>
        <span className="h4">{s.title}</span>
        <div className="hb-card">
          <span className="eyebrow">{s.card.label}</span>
          <span className="h4" style={{ whiteSpace: "pre-line" }}>
            {s.card.head}
          </span>
          <span className="mono-s soft">{s.card.foot}</span>
        </div>
        <p className="txt">{s.note}</p>
      </div>
    </div>
  );
}
