import { notFound } from "next/navigation";
import { Edge } from "@/components/Bars";
import { CopyButton } from "@/components/CopyButton";
import { Kicker } from "@/components/Kicker";
import { OutcomeBadge } from "@/components/Outcome";
import { getStore } from "@/lib/server";
import { receiptView } from "@/lib/views";
import { addressUrl, health, txUrl, units, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const store = await getStore();
  const action = await store.getAction(id);
  if (!action) notFound();
  const r = await receiptView(action, await store.getCounterfactual(id));
  const d = r.baseDecimals;
  const cf = r.counterfactual;

  return (
    <>
      <section className="sec">
        <div className="wrap pad" style={{ paddingBottom: 56 }}>
          <Kicker>Receipt</Kicker>
          <div className="spread">
            <h1>
              {r.market}
              <br />
              {r.side}
            </h1>
            <div style={{ textAlign: "right" }}>
              <OutcomeBadge outcome={r.outcome} />
              <div className="num m" style={{ marginTop: 16 }}>
                {health(r.healthBefore)} <small>→</small> {health(r.healthAfter)}
              </div>
              <div className="cap soft" style={{ marginTop: 8 }}>
                health before and after
              </div>
            </div>
          </div>
          {r.reason && (
            <p className={`note ${r.outcome === "missed" || r.outcome === "conflict" ? "bad" : ""}`} style={{ marginTop: 32 }}>
              {r.reason}
            </p>
          )}
        </div>
        <div className="wrap" style={{ paddingBottom: 72 }}>
          <div className="grid g2" style={{ gap: 48 }}>
            <div>
              <h3 style={{ marginBottom: 16 }}>What Hoax did</h3>
              <div className="rows">
                <div className="r">
                  <span>Account</span>
                  <a href={addressUrl(r.owner)}>{r.owner}</a>
                </div>
                <div className="r">
                  <span>Closed</span>
                  <span>
                    {units(r.sizeFilled, d)} of {units(r.sizeBefore, d)}
                  </span>
                </div>
                <div className="r">
                  <span>Asked</span>
                  <span>{units(r.sizeRequested, d)}</span>
                </div>
                <div className="r">
                  <span>Left open</span>
                  <span>{units(r.sizeAfter, d)}</span>
                </div>
                <div className="r">
                  <span>Average fill</span>
                  <span>{usd(r.avgPrice)}</span>
                </div>
                <div className="r">
                  <span>Mark at close</span>
                  <span>{usd(r.mark)}</span>
                </div>
                <div className="r">
                  <span>Transaction</span>
                  <span>{r.txHash ? <a href={txUrl(r.txHash)}>{r.txHash.slice(0, 18)}… ↗</a> : "none sent"}</span>
                </div>
                <div className="r">
                  <span>Block</span>
                  <span>{r.block?.toString() ?? "–"}</span>
                </div>
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 16 }}>Health and cost</h3>
              <div className="rows">
                <div className="r">
                  <span>Liquidation price</span>
                  <span>
                    {usd(r.liqPriceBefore)} → {usd(r.liqPriceAfter)}
                  </span>
                </div>
                <div className="r">
                  <span>Close cost</span>
                  <span>{r.cost !== null ? `${usd(r.cost, 4)} USDso` : "–"}</span>
                </div>
                <div className="r">
                  <span>Estimated beforehand</span>
                  <span>{r.estCloseCost !== null ? `${usd(r.estCloseCost, 4)} USDso` : "–"}</span>
                </div>
                <div className="r">
                  <span>Liquidation would cost</span>
                  <span>{r.estLiqCost !== null ? `${usd(r.estLiqCost)} USDso` : "–"}</span>
                </div>
                <div className="r">
                  <span>Builder fee</span>
                  <span>{Number(r.builderFee1k) / 1000} bps</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec alt">
        <Edge seed={8} opacity={0.5} />
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <Kicker>Counterfactual</Kicker>
              <h2>Was it needed?</h2>
            </div>
            <div>
              {r.outcome === "pending" && (
                <p className="lede">
                  Watching for 24 h. A save if the mark reaches {usd(r.liqPriceBefore)} and the position survives.
                </p>
              )}
              {r.outcome === "saved" && cf && (
                <>
                  <div className="num">
                    {usd(cf.preserved)}
                    <small>USDso preserved</small>
                  </div>
                  <div className="rows" style={{ marginTop: 32 }}>
                    <div className="r">
                      <span>Old liquidation price reached at block</span>
                      <span>{cf.reachedAtBlock?.toString()}</span>
                    </div>
                    <div className="r">
                      <span>Equity held then</span>
                      <span>{usd(cf.equityAtReach)} USDso</span>
                    </div>
                    <div className="r">
                      <span>Equity if liquidated</span>
                      <span>{usd(cf.equityIfLiquidated)} USDso</span>
                    </div>
                  </div>
                </>
              )}
              {r.outcome === "not-needed" && (
                <p className="lede">Liquidation price not reached in 24 h. The close cost was insurance.</p>
              )}
              {(r.outcome === "skipped" || r.outcome === "missed" || r.outcome === "conflict") && (
                <p className="lede">{r.reason ?? r.outcome}</p>
              )}
              <p className="cap soft" style={{ marginTop: 28 }}>
                Preserved = equity at the old liquidation price − equity after a liquidation there.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <Edge seed={13} opacity={0.5} />
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <div className="grid g-aside" style={{ gap: 48 }}>
            <div>
              <Kicker>Verification</Kicker>
              <h2>Check it yourself</h2>
              <div className="row" style={{ marginTop: 24 }}>
                <CopyButton text={`/r/${r.id}`} label="Copy link to share" />
              </div>
            </div>
            <div>
              <div className="rows">
                <div className="r">
                  <span>Receipt hash</span>
                  <span>{r.receiptHash || "–"}</span>
                </div>
                <div className="r">
                  <span>Signed by Hoax key</span>
                  <a href={addressUrl(String(r.receipt.hoaxKey))}>{String(r.receipt.hoaxKey)}</a>
                </div>
                <div className="r">
                  <span>Signature</span>
                  <span>
                    {r.signatureValid === true && <span className="tag saved">valid</span>}
                    {r.signatureValid === false && <span className="tag missed">does not match</span>}
                    {r.signatureValid === null && "unsigned"}
                  </span>
                </div>
              </div>
              <p className="cap soft" style={{ marginTop: 20 }}>
                keccak256 of sorted-key JSON · EIP-191 signature
              </p>
              <details style={{ marginTop: 16 }}>
                <summary>Receipt JSON</summary>
                <pre>{JSON.stringify(r.receipt, null, 2)}</pre>
              </details>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
