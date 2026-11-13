"use client";
// The cost gate as a navy brief card, after MarketSnack's research brief: three tabs,
// one for each term of the rule, and the rule itself in a white inner card.

import { useState } from "react";

const TABS = [
  {
    k: "close",
    label: "Close",
    cap: "01 / The trim",
    title: "What the close costs.",
    body: "The cost of the smallest close that restores your target, read from the live book.",
  },
  {
    k: "liq",
    label: "Liquidation",
    cap: "02 / The alternative",
    title: "What liquidation would cost.",
    body: "The LiquidationEngine's 100 bps penalty plus a forced close at no better than its 50 bps minimum spread.",
  },
  {
    k: "lambda",
    label: "Decision",
    cap: "03 / The rule",
    title: "Cheaper, or nothing.",
    body: "λ defaults to 0.5: Hoax acts only when the trim costs at most half of the liquidation it prevents.",
  },
] as const;

export function GateBrief({ lambda }: { lambda: number }) {
  const [on, setOn] = useState<(typeof TABS)[number]["k"]>("close");
  const tab = TABS.find((t) => t.k === on) ?? TABS[0];
  return (
    <div className="dark pg-brief">
      <div className="between pg-brief-head">
        <span className="cap">Cost gate</span>
        <span className="mono-xs">λ = {lambda}</span>
      </div>
      <div className="seg dark-seg" role="tablist" aria-label="The terms of the cost gate">
        {TABS.map((t) => (
          <button key={t.k} role="tab" aria-selected={t.k === on} className={t.k === on ? "on" : ""} onClick={() => setOn(t.k)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="pg-brief-cap">{tab.cap}</div>
      <div className="h4 pg-brief-title">{tab.title}</div>
      <div className="pg-brief-in" role="tabpanel">
        <div className={`pg-eq on-${on}`}>
          <span className="t-close">
            C<sub>close</sub>
          </span>{" "}
          ≤ <span className="t-lambda">λ</span> · <span className="t-liq">
            C<sub>liq</sub>
          </span>
        </div>
        <p className="txt">{tab.body}</p>
      </div>
    </div>
  );
}
