"use client";
// The live Radar: every dreamDEX liquidation, refreshed every ten seconds, laid out
// as MarketSnack's workspace: an overview card, the signals surfaced, the feed,
// and context beside it.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RadarLiquidation, RadarSignal, RadarSnapshot } from "@/lib/radar";
import { base, compact, hhmm, qty, usdso } from "@/lib/radarFormat";
import { AreaChart, timeLabels } from "./home/AreaChart";
import { Arrow } from "./Ui";

type Snap = RadarSnapshot & { signals?: RadarSignal[] };

const NETS: Array<[string, string]> = [
  ["all", "Both networks"],
  ["50383", "Somnia Tokyo"],
  ["50312", "Shannon"],
];
const NET_SHORT: Record<number, string> = { 50383: "Tokyo", 50312: "Shannon" };
/** Rows the feed shows at first, and adds with each "Show more". */
const PAGE = 30;

function clock(t: number): string {
  return new Date(t * 1000).toISOString().slice(11, 16) + " UTC";
}
function since(t: number, now: number): string {
  const s = Math.max(0, Math.round(now / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RadarLive({ initial }: { initial: Snap | null }) {
  const [chain, setChain] = useState("all");
  const [hours, setHours] = useState(24);
  const [snap, setSnap] = useState<Snap | null>(initial);
  const [err, setErr] = useState<string | null>(initial ? null : "The markets indexer did not answer. Retrying.");
  // Relative times only after mount, so the server's HTML and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  const seen = useRef(new Set((initial?.items ?? []).map(key)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  // Signals compare today with the week, so they come with the 24-hour view and are kept while the 7-day view shows.
  const [signals, setSignals] = useState<RadarSignal[]>(initial?.signals ?? []);

  useEffect(() => {
    let stop = false;
    let first = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/radar?chain=${chain}&hours=${hours}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as Snap;
        if (stop) return;
        const added = new Set(next.items.map(key).filter((k) => !seen.current.has(k)));
        next.items.forEach((l) => seen.current.add(key(l)));
        setFresh(first ? new Set() : added);
        first = false;
        setSnap(next);
        if (next.signals) setSignals(next.signals);
        setErr(null);
      } catch {
        if (!stop) setErr("The markets indexer did not answer. Retrying.");
      }
    };
    void load();
    const id = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [chain, hours]);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setShown(PAGE), [chain, hours]);

  const t = snap?.totals;
  const params = snap ? Object.values(snap.params)[0] : null;
  const markets = (snap?.markets ?? []).slice(0, 8);
  const maxNotional = Math.max(1, ...markets.map((m) => m.notional));
  const lost = t ? t.penalty + t.spreadFloor : 0;
  const hot = signals.filter((s) => s.ratio >= 1.5).slice(0, 4);
  const fmtT = (x: number) => (hours > 24 ? new Date(x * 1000).toISOString().slice(5, 10).replace("-", "/") : `${hhmm(x)} UTC`);

  return (
    <>
      <div className="rd-controls">
        <div className="seg" role="tablist" aria-label="Network">
          {NETS.map(([v, l]) => (
            <button key={v} role="tab" aria-selected={chain === v} className={chain === v ? "on" : ""} onClick={() => setChain(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="switch" role="tablist" aria-label="Window">
          {[
            [24, "24 hours"],
            [168, "7 days"],
          ].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={hours === v} className={hours === v ? "on" : ""} onClick={() => setHours(Number(v))}>
              {l}
            </button>
          ))}
        </div>
        <span className={`live-pill rd-live${err ? " err" : ""}`}>
          <i aria-hidden />
          {err ? err : snap && now ? `Live · updated ${since(Math.floor(snap.generatedAt / 1000), now)}` : "Live"}
        </span>
      </div>

      {/* the overview */}
      <section className="card rd-over" aria-label="Market overview">
        <div className="between">
          <span className="h4">Market overview</span>
          <span className="eyebrow soft">Live data · {hours === 24 ? "last 24 hours" : "last 7 days"}</span>
        </div>
        <div className="rd-over-body">
          <div className="rd-kpis">
            {(
              [
                ["Liquidations", t ? t.count.toLocaleString("en-US") : "–", ""],
                ["Notional liquidated", t ? compact(t.notional) : "–", "USDso"],
                ["Lost to the engine, at least", t ? compact(lost) : "–", "USDso"],
                ["Accounts hit", t ? t.accounts.toLocaleString("en-US") : "–", ""],
              ] as const
            ).map(([k, v, u], i) => (
              <div key={k} className={i === 2 ? "bad" : undefined}>
                <span>{k}</span>
                <b>
                  {v}
                  {u && <small>{u}</small>}
                </b>
              </div>
            ))}
          </div>
          <div className="rd-activity">
            <span className="mono-s ink">Liquidation activity</span>
            {snap && snap.series && <AreaChart id={`rd-${hours}`} values={snap.series.map((b) => b.notional)} labels={timeLabels(snap.series, 4, fmtT)} height={150} guides={2} />}
          </div>
        </div>
      </section>

      {/* signals */}
      <section className="rd-signals" aria-label="Signals surfaced">
        <div className="stack rd-signals-head" style={{ gap: "0.6rem" }}>
          <span className="eyebrow">Signals surfaced · {hot.length}</span>
          <span className="txt">Markets liquidating at 1.5× their own 7-day pace or faster, today.</span>
        </div>
        {hot.length ? (
          <div className="rd-sig-grid">
            {hot.map((s, i) => (
              <div key={`${s.chainId}:${s.symbol}`} className={i === 0 ? "blueblock rd-sig" : "card rd-sig"}>
                <span className="eyebrow">
                  {i === 0 ? "Signal in focus" : "Signal"} · {NET_SHORT[s.chainId]}
                </span>
                <span className="h4">{base(s.symbol)} is unwinding.</span>
                <span className="mono-s">
                  {s.count} today against {s.baseline.toFixed(1)} a day · {s.ratio.toFixed(1)}×
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="card rd-sig">
            <span className="h5">No market is running hot.</span>
            <span className="mono-s soft">Every market with liquidations today is within 1.5× of its 7-day pace.</span>
          </div>
        )}
      </section>

      <div className="rd-grid">
        <section className="card rd-feed" aria-label="Latest liquidations">
          <div className="rd-feed-head between">
            <div className="stack" style={{ gap: "0.4rem" }}>
              <span className="eyebrow">The feed</span>
              <span className="h4">Latest liquidations</span>
            </div>
            <span className="mono-s muted">{snap ? `${Math.min(shown, snap.items.length)} of ${snap.totals.count}` : ""}</span>
          </div>
          <div className="scroll-x">
            <table className="list rd-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Market</th>
                  <th className="rd-closed">Closed</th>
                  <th className="rd-notional" style={{ textAlign: "right" }}>
                    Notional
                  </th>
                  <th style={{ textAlign: "right" }}>Cost, at least</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(snap?.items ?? []).slice(0, shown).map((l) => (
                  <tr key={key(l)} className={fresh.has(key(l)) ? "rd-new" : undefined}>
                    <td>
                      <span className="ink">{now ? since(l.time, now) : clock(l.time)}</span>
                      <span className="muted rd-net"> · {NET_SHORT[l.chainId]}</span>
                    </td>
                    <td>
                      <span className="rd-mkt">{l.legs.map((x) => base(x.symbol)).join(" + ")}</span>
                    </td>
                    <td className="rd-closed">
                      {l.legs.map((x, i) => (
                        <span key={i}>
                          {i > 0 ? " · " : ""}
                          <span className={x.side === "long" ? "rd-long" : "rd-short"}>{x.side}</span> {qty(x.size)} @ {usdso(x.price)}
                        </span>
                      ))}
                    </td>
                    <td className="rd-notional" style={{ textAlign: "right" }}>
                      {usdso(l.notional)}
                    </td>
                    <td style={{ textAlign: "right" }} className="rd-cost">
                      {usdso(l.penalty + l.spreadFloor)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/radar/${l.chainId}/${l.txHash}`} aria-label="Liquidation card" className="rd-cardlink">
                        <span className="rd-net">Card </span>→
                      </Link>
                    </td>
                  </tr>
                ))}
                {snap && snap.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="soft">
                      No liquidations in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {snap && snap.items.length > shown && (
            <div className="rd-more">
              <button className="btn ghost sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, snap.items.length - shown)} more
              </button>
            </div>
          )}
        </section>

        <aside className="rd-side">
          <section className="panel rd-where" aria-label="Busiest markets">
            <span className="eyebrow">The context</span>
            <span className="h4">Where it happens</span>
            <p className="mono-s soft">Notional liquidated by market, {hours === 24 ? "last 24 hours" : "last 7 days"}.</p>
            <div className="panel-in rd-bars">
              {markets.map((m) => (
                <div key={`${m.chainId}:${m.symbol}`} className="rd-bar">
                  <div className="between">
                    <span className="ink">
                      {base(m.symbol)} <span className="muted mono-xs">{NET_SHORT[m.chainId]}</span>
                    </span>
                    <span className="mono-s soft">
                      {compact(m.notional)} · {m.count}
                    </span>
                  </div>
                  <div className="bar-track">
                    <i style={{ width: `${(m.notional / maxNotional) * 100}%` }} />
                  </div>
                </div>
              ))}
              {!markets.length && <span className="mono-s soft">Nothing in this window.</span>}
            </div>
          </section>
          <section className="dark rd-gate" aria-label="Hoax's cost gate">
            <span className="eyebrow">With Hoax</span>
            <span className="h4">A trim first, and only if it costs at most half of this.</span>
            <p className="txt">
              Hoax watches health every second and closes the smallest slice that restores your target before the engine can act. It skips any trim
              that would cost more than half of the liquidation it prevents.
            </p>
            <Link className="btn white sm" href="/start">
              Protect my positions
              <Arrow />
            </Link>
          </section>
          <p className="mono-xs muted rd-foot">
            Cost, at least = penalty ({params ? params.penaltyBps / 100 : 1}%) + the minimum forced-close spread ({params ? params.minSpreadBps / 100 : 0.5}%), both
            {params?.source === "chain" ? " read from the LiquidationEngine" : " at the protocol's documented rates"}. The real spread can be wider. dreamDEX&apos;s
            test pools are left out.
          </p>
        </aside>
      </div>
    </>
  );
}

function key(l: RadarLiquidation): string {
  return `${l.chainId}:${l.txHash}:${l.account}`;
}
