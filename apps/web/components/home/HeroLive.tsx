"use client";
// The hero image cell: the drawing on its drafting board, started from ETH's live mark.
import { useMarkets } from "@/components/LiveMarkets";
import { HeroDrawing } from "./HeroDrawing";

export function HeroLive() {
  const { rows } = useMarkets(30_000);
  const eth = rows?.find((m) => m.baseSymbol === "ETH");
  const mark = eth?.mark ? Number(eth.mark) / 1e18 : null;
  return (
    <div className="hero-img drawing">
      <span className="ruler-x" style={{ top: "1.2rem" }} aria-hidden />
      <span className="ruler-x" style={{ bottom: "1.2rem" }} aria-hidden />
      <span className="ruler-y" style={{ left: "1.2rem" }} aria-hidden />
      <span className="ruler-y" style={{ right: "1.2rem" }} aria-hidden />
      <span className="plus tl" aria-hidden />
      <span className="plus tr" aria-hidden />
      <span className="plus bl" aria-hidden />
      <span className="plus br" aria-hidden />
      <div className="hero-board">{mark ? <HeroDrawing key={Math.round(mark)} mark={mark} /> : <HeroDrawing mark={2400} />}</div>
    </div>
  );
}
