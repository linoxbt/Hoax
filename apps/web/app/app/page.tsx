"use client";
// Overview: is Hoax protecting this wallet, how each position stands, and what happened lately.
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { AppHead } from "@/components/AppHead";
import { EngineBadge } from "@/components/EngineBadge";
import { HealthField } from "@/components/HealthField";
import { ReceiptTable } from "@/components/ReceiptRow";
import { Btn, CornerLink, Eyebrow } from "@/components/Ui";
import { useApp } from "@/lib/appContext";
import { short, units, usd } from "@/lib/format";
import { PROTECTION_TITLE, positionTag, protectionState } from "@/lib/protection";
import { api } from "@/lib/session";
import { useHoax } from "@/lib/wallet";
import type { ActionJson } from "@/lib/types";

/** Health colour: red under the default trigger, amber under the target, green above. */
const hl = (h: number | null | undefined) => (h === null || h === undefined ? "" : h < 1.25 ? "hl-bad" : h < 1.6 ? "hl-warn" : "hl-ok");

export default function Overview() {
  const { session, view } = useApp();
  const { engine, sample } = useHoax();
  const [recent, setRecent] = useState<ActionJson[] | null>(null);
  useEffect(() => {
    setRecent(null);
    api<ActionJson[]>(`/api/actions?owner=${session.owner}&chain=${session.chainId}&limit=5`).then(setRecent, () => setRecent([]));
  }, [session.owner, session.chainId]);

  const account = view?.account;
  const state = protectionState(view, engine);
  const status = PROTECTION_TITLE[state];
  const linkedCount = view?.links ? Object.values(view.links).filter(Boolean).length : null;
  const gas = view?.keyBalance ? Number(formatEther(BigInt(view.keyBalance))) : null;
  const lowest =
    view?.positions.reduce<number | null>((m, p) => (p.health === null ? m : m === null ? p.health : Math.min(m, p.health)), null) ?? null;
  // The one that matters: the position whose health is lowest.
  const focus = lowest === null ? undefined : view?.positions.find((p) => p.health === lowest);
  const focusPolicy = focus ? view?.policies.find((x) => x.market === focus.market) : undefined;
  const nPos = view?.positions.length ?? 0;

  return (
    <>
      <AppHead kicker="Overview" title={status}>
        <Btn href="/app/positions" fill>
          Positions
        </Btn>
        <Btn href="/app/settings">Settings</Btn>
      </AppHead>

      {view && (!account || account.status === "pending_key" || account.status === "pending_link") && (
        <div className="panel db-cta">
          <div>
            <Eyebrow>Not protected yet</Eyebrow>
            <p className="txt">Link Hoax in one transaction and every position on this account is covered.</p>
          </div>
          <Btn href={account ? "/start/link" : "/start"} fill>
            Activate protection
          </Btn>
        </div>
      )}
      {(account?.status === "unlinked" || account?.status === "retired") && (
        <p className="note bad db-gap">Key unlinked in dreamDEX. Protection is off.</p>
      )}
      {state === "engine-offline" && (
        <p className="note bad db-gap">
          The protection engine for this network has not reported in recently. Hoax is not acting on this account until it is back.
        </p>
      )}

      <div className={`db-top${focus ? "" : " solo"}`}>
        <section className="card db-ov">
          <div className="db-card-h">
            <h2 className="h5">Account overview</h2>
            {sample || state === "demo" ? (
              <span className="db-label">Sample data</span>
            ) : (
              <span className="live-pill">
                <i aria-hidden />
                Live
              </span>
            )}
          </div>
          <div className="db-tiles">
            <div className="db-tile">
              <span>Lowest health</span>
              <b className={`num s ${hl(lowest)}`}>{lowest === null ? "–" : lowest.toFixed(2)}</b>
            </div>
            <div className="db-tile">
              <span>Open positions</span>
              <b className="num s">{view?.positions.length ?? "–"}</b>
            </div>
            <div className="db-tile">
              <span>Protected</span>
              <b className="num s">{view?.isOwner ? (state === "protecting" ? view.policies.filter((p) => p.enabled).length : 0) : "–"}</b>
            </div>
            <Link href="/app/alerts" className="db-tile link">
              <span>Alerts</span>
              <b className="num s">{view?.alerts.length ?? "–"}</b>
            </Link>
          </div>
          <div className="db-facts">
            <EngineBadge chainId={session.chainId} />
            <span>
              <b>{linkedCount === null || !view ? "–" : `${linkedCount}/${view.markets.length}`}</b> markets linked
            </span>
            <span>
              <b>{gas === null ? "–" : gas.toFixed(3)}</b> STT key gas
            </span>
            <span>
              <b>{view?.isOwner ? view.policies.filter((p) => p.enabled).length : "–"}</b> policies on
            </span>
          </div>
        </section>

        {focus && (
          <Link href={`/app/positions/${focus.market}`} className="dark db-focus">
            <Eyebrow>Closest to its trigger</Eyebrow>
            <div className="h4">
              {focus.market} <span className="db-focus-side">{focus.side}</span>
            </div>
            <div className="db-focus-num">
              <span>Health</span>
              <b className="num">{focus.health === null ? "–" : focus.health.toFixed(2)}</b>
            </div>
            <div className="db-focus-pol">
              <span>
                Acts at <b>{focusPolicy?.triggerHealth ?? 1.25}</b>
              </span>
              <span>
                Restores <b>{focusPolicy?.targetHealth ?? 1.6}</b>
              </span>
            </div>
            <span className="btn white sm db-focus-go">
              <span>Open position</span>
              <svg
                className="arrow"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2 8h12M9 3l5 5-5 5" />
              </svg>
            </span>
          </Link>
        )}
      </div>

      <section className="db-sec">
        <div className="db-sec-h">
          <div>
            <Eyebrow>Your positions / {view ? `${nPos} ${nPos === 1 ? "market" : "markets"}` : "–"}</Eyebrow>
            <h2 className="h4">Positions</h2>
          </div>
          <CornerLink href="/app/positions">All positions</CornerLink>
        </div>
        {view && view.positions.length === 0 && <p className="card db-empty">No open perp positions on this account.</p>}
        <div className={`db-pgrid${nPos === 1 ? " one" : ""}`}>
          {view?.positions.map((p) => {
            const policy = view.policies.find((x) => x.market === p.market);
            const tag = positionTag(view, engine, policy);
            return (
              <Link key={p.market} href={`/app/positions/${p.market}`} className="card db-pcard">
                <div className="db-pcard-a">
                  <div className="db-pcard-h">
                    <div>
                      <Eyebrow tone="soft">{p.side}</Eyebrow>
                      <h3 className="h4">{p.market}</h3>
                    </div>
                    {tag && <span className={`tag ${tag.cls}`}>{tag.text}</span>}
                  </div>
                  <div className="db-pcard-health">
                    <span>Health</span>
                    <b className={`num m ${hl(p.health)}`}>{p.health === null ? "–" : p.health.toFixed(2)}</b>
                  </div>
                  <div className="db-kv4">
                    <div>
                      <span>Size</span>
                      <b>
                        {units(p.size.replace("-", ""), p.baseDecimals)} {p.baseSymbol}
                      </b>
                    </div>
                    <div>
                      <span>Mark</span>
                      <b>{p.markOk ? usd(p.mark) : "stale"}</b>
                    </div>
                    <div>
                      <span>Notional</span>
                      <b>{usd((BigInt(p.size.replace("-", "")) * BigInt(p.mark)) / 10n ** BigInt(p.baseDecimals))}</b>
                    </div>
                    <div>
                      <span>Liq. price</span>
                      <b>{p.liqPrice ? usd(p.liqPrice) : "–"}</b>
                    </div>
                  </div>
                </div>
                <div className="panel db-pcard-b">
                  <HealthField health={p.health} trigger={policy?.triggerHealth ?? 1.25} target={policy?.targetHealth ?? 1.6} />
                  <div className="go">
                    Open <span aria-hidden>→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card db-table-card db-sec">
        <div className="db-card-h db-in">
          <div>
            <Eyebrow>Receipts / latest 5</Eyebrow>
            <h2 className="h5">Recent activity</h2>
          </div>
          <CornerLink href="/app/receipts">View all</CornerLink>
        </div>
        {recent ? (
          <ReceiptTable actions={recent} />
        ) : (
          <p className="mono-s soft db-in">
            <span className="spin" aria-hidden /> Loading receipts…
          </p>
        )}
        {account?.hoaxKey && (
          <p className="db-card-foot">
            Key <span className="mono">{short(account.hoaxKey)}</span>
            {view && view.isOwner === false ? " · read-only" : ""}
          </p>
        )}
      </section>
    </>
  );
}
