import Link from "next/link";
import { notFound } from "next/navigation";
import { Label } from "@/components/Ui";
import { addressUrl, short, txUrl } from "@/lib/format";
import { RADAR_CHAINS, radarTx, type RadarLiquidation } from "@/lib/radar";
import { NET_SHORT, qty, usdso } from "@/lib/radarFormat";

export const dynamic = "force-dynamic";

type Params = { chain: string; tx: string };

function parse(p: Params): { chainId: number; tx: string } | null {
  const chainId = Number(p.chain);
  if (!(RADAR_CHAINS as readonly number[]).includes(chainId) || !/^0x[0-9a-fA-F]{64}$/.test(p.tx)) return null;
  return { chainId, tx: p.tx.toLowerCase() };
}

const site = () =>
  process.env.HOAX_SITE_URL ??
  process.env.URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://usehoax.netlify.app");

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const p = parse(await params);
  if (!p) return { title: "Radar" };
  const { items } = await radarTx(p.chainId, p.tx).catch(() => ({ items: [] as RadarLiquidation[] }));
  const l = items[0];
  if (!l) return { title: "Liquidation · Radar" };
  const cost = usdso(l.penalty + l.spreadFloor);
  return {
    title: `Liquidated: ${l.legs.map((x) => x.symbol).join(" + ")} · Radar`,
    description: `A ${l.legs[0].side} on dreamDEX was liquidated on ${NET_SHORT[l.chainId]}: ${usdso(l.notional)} USDso closed by the engine, at least ${cost} USDso lost to the penalty and forced spread.`,
  };
}

export default async function LiquidationCard({ params }: { params: Promise<Params> }) {
  const p = parse(await params);
  if (!p) notFound();
  const { items, params: rates } = await radarTx(p.chainId, p.tx);
  if (!items.length) notFound();
  const url = `${site()}/radar/${p.chainId}/${p.tx}`;
  return (
    <>
      <section className="phead">
        <div className="phead-title">
          <Label dot>
            <Link href="/radar">Radar</Link> · {NET_SHORT[p.chainId]}
          </Label>
          <h1 className="h1">Liquidated on dreamDEX.</h1>
        </div>
        <div className="phead-side">
          <div className="txt">
            The liquidation engine closed this position at the price it could get and charged the penalty. Every figure below is from the chain or the
            protocol&apos;s own rates.
          </div>
          <div className="row" style={{ gap: "1rem" }}>
            <a
              className="pill"
              href={`https://x.com/intent/post?text=${encodeURIComponent(`A dreamDEX perp just got liquidated: at least ${usdso(items[0].penalty + items[0].spreadFloor)} USDso to the engine. Every liquidation, live on Hoax Radar. @DreamDEXSomnia`)}&url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
            >
              Share on X ↗
            </a>
            <Link className="pill ghost" href="/radar">
              All liquidations
            </Link>
          </div>
        </div>
      </section>

      {items.map((l) => (
        <div key={l.account} className="rd-card">
          <section className="sec" style={{ marginTop: 0 }}>
            <div className="p rd-lost">
              <span className="mono-s soft">Lost to the engine, at least</span>
              <span className="rd-big">
                {usdso(l.penalty + l.spreadFloor)}
                <small>USDso</small>
              </span>
              <span className="mono-s muted">
                {new Date(l.time * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC · {NET_SHORT[l.chainId]}
              </span>
            </div>
            <div className="p bt">
              <div className="rows">
                {l.legs.map((x, i) => (
                  <div className="r" key={i}>
                    <span>{x.symbol}</span>
                    <span>
                      {x.side} {qty(x.size)} closed @ {usdso(x.price)}
                    </span>
                  </div>
                ))}
                <div className="r">
                  <span>Notional closed</span>
                  <span>{usdso(l.notional)} USDso</span>
                </div>
                <div className="r">
                  <span>Penalty ({rates.penaltyBps / 100}%)</span>
                  <span>{usdso(l.penalty)} USDso</span>
                </div>
                <div className="r">
                  <span>Forced spread, at least ({rates.minSpreadBps / 100}%)</span>
                  <span>{usdso(l.spreadFloor)} USDso</span>
                </div>
                {l.keeperReward != null && (
                  <div className="r">
                    <span>Paid to the keeper (event)</span>
                    <span>{usdso(l.keeperReward)} USDso</span>
                  </div>
                )}
                {l.badDebt != null && (
                  <div className="r">
                    <span>Bad debt absorbed</span>
                    <span>{usdso(l.badDebt)} USDso</span>
                  </div>
                )}
                <div className="r">
                  <span>Account</span>
                  <span>
                    <a href={addressUrl(l.account, l.chainId)} target="_blank" rel="noreferrer">
                      {short(l.account)} ↗
                    </a>
                  </span>
                </div>
                <div className="r">
                  <span>Transaction</span>
                  <span>
                    <a href={txUrl(l.txHash, l.chainId)} target="_blank" rel="noreferrer">
                      {short(l.txHash)} ↗
                    </a>
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="sec rd-gate" style={{ marginTop: 0 }}>
            <div className="p stack" style={{ gap: "1.6rem", height: "100%" }}>
              <span className="mono-s" style={{ color: "var(--brand)" }}>
                With Hoax
              </span>
              <div className="h3">A trim first, for at most {usdso((l.penalty + l.spreadFloor) / 2)} USDso.</div>
              <p className="txt">
                Hoax reads health every second and closes the smallest slice that restores your target before health reaches 1. It only sends that trim
                when it costs at most half of the liquidation it prevents, and signs a receipt for it.
              </p>
              <p className="mono-xs muted">
                Hoax cannot beat a price that gaps through the liquidation level faster than one block, and it skips a trim the book cannot fill inside
                your slippage.
              </p>
              <Link className="pill" href="/start" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
                Protect my positions
              </Link>
            </div>
          </section>
        </div>
      ))}
    </>
  );
}
