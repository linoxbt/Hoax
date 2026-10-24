import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { Label } from "@/components/Ui";
import { OutcomeBadge } from "@/components/Outcome";
import { DEMO, getStore, isUuid } from "@/lib/server";
import { receiptView } from "@/lib/views";
import { addressUrl, health, txUrl, units, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const store = await getStore();
  const action = await store.getAction(id);
  if (!action) notFound();
  const r = await receiptView(action, await store.getCounterfactual(id));
  const d = r.baseDecimals;
  const cf = r.counterfactual;
  // The demo's sample receipts carry made-up hashes: no explorer link for those.
  const link = !DEMO;

  return (
    <>
      <section className="sec first phead">
        <div className="phead-title">
          <span className="plus tl" aria-hidden />
          <Label dot>Receipt · {r.id.slice(0, 8)}</Label>
          <h1 className="h1">
            {r.market} {r.side}
          </h1>
        </div>
        <div className="phead-side">
          <div className="p">
            <OutcomeBadge outcome={r.outcome} />
            <div className="num m" style={{ marginTop: "2.4rem" }}>
              {health(r.healthBefore)} <small>→</small> {health(r.healthAfter)}
            </div>
            <div className="mono-s soft" style={{ marginTop: "1.2rem" }}>
              Health before and after
            </div>
            {r.reason && (
              <p className={`note ${r.outcome === "missed" || r.outcome === "conflict" ? "bad" : ""}`} style={{ marginTop: "2.4rem" }}>
                {r.reason}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="sec cells c2">
        <div className="p">
          <div className="mono-s ink">What Hoax did</div>
          <div className="rows" style={{ marginTop: "2.4rem" }}>
            <div className="r">
              <span>Account</span>
              {link ? <a href={addressUrl(r.owner, r.chainId)}>{r.owner}</a> : <span>{r.owner}</span>}
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
              <span>
                {r.txHash ? link ? <a href={txUrl(r.txHash, r.chainId)}>{r.txHash.slice(0, 18)}… ↗</a> : `${r.txHash.slice(0, 18)}… (sample)` : "none sent"}
              </span>
            </div>
            <div className="r">
              <span>Network</span>
              <span>{r.networkName}</span>
            </div>
            <div className="r">
              <span>Block</span>
              <span>{r.block?.toString() ?? "–"}</span>
            </div>
          </div>
        </div>
        <div className="p">
          <div className="mono-s ink">Health and cost</div>
          <div className="rows" style={{ marginTop: "2.4rem" }}>
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
      </section>

      <section className="sec cells c-why">
        <div className="p">
          <div className="mono-s ink">Counterfactual</div>
          <h2 className="h2" style={{ marginTop: "1.6rem" }}>
            Was it needed?
          </h2>
          <div style={{ marginTop: "3.2rem" }}>
            {r.outcome === "pending" && <p className="txt ink">Watching for 24 h. A save if the mark reaches {usd(r.liqPriceBefore)} and the position survives.</p>}
            {r.outcome === "unconfirmed" && <p className="txt ink">The close was sent and its result is being confirmed on chain.</p>}
            {r.outcome === "saved" && cf && (
              <>
                <div className="num accent">
                  <small>up to</small> {usd(cf.preserved)}
                  <small>USDso preserved</small>
                </div>
                <div className="rows" style={{ marginTop: "3.2rem" }}>
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
            {r.outcome === "not-needed" && <p className="txt ink">Liquidation price not reached in 24 h. The close cost was insurance.</p>}
            {(r.outcome === "skipped" || r.outcome === "missed" || r.outcome === "conflict") && <p className="txt ink">{r.reason ?? r.outcome}</p>}
            <p className="mono-xs soft" style={{ marginTop: "2.4rem" }}>
              Preserved = equity at the old liquidation price − equity after liquidating the whole position there. dreamDEX liquidates in
              steps and can stop early, so this is an upper bound: what the close saved if the move had gone on to liquidate it all.
            </p>
          </div>
        </div>
        <div className="p">
          <div className="mono-s ink">Verification</div>
          <div className="rows" style={{ marginTop: "2.4rem" }}>
            <div className="r">
              <span>Receipt hash</span>
              <span>{r.receiptHash || "–"}</span>
            </div>
            <div className="r">
              <span>Signed by</span>
              {link ? <a href={addressUrl(String(r.receipt.hoaxKey), r.chainId)}>{String(r.receipt.hoaxKey)}</a> : <span>{String(r.receipt.hoaxKey)}</span>}
            </div>
            <div className="r">
              <span>Signature</span>
              <span>
                {r.signatureValid === true && <span className="tag saved">valid</span>}
                {r.signatureValid === false && <span className="tag missed">does not match</span>}
                {r.signatureValid === null && "unsigned"}
              </span>
            </div>
            {cf?.resolution && (
              <div className="r">
                <span>Outcome record</span>
                <span>
                  {r.resolutionValid === true && <span className="tag saved">signed, matches this receipt</span>}
                  {r.resolutionValid === false && <span className="tag missed">does not match</span>}
                  {r.resolutionValid === null && "unsigned"}
                </span>
              </div>
            )}
          </div>
          <p className="mono-xs soft" style={{ marginTop: "1.6rem" }}>
            keccak256 of sorted-key JSON · EIP-191 signature. The receipt is signed when Hoax closes and never changed; the final outcome is a
            second record, signed by the same key, that names this receipt by its hash.
          </p>
          <div style={{ marginTop: "2.4rem" }}>
            <CopyButton text={`/r/${r.id}`} label="Copy link to share" />
          </div>
          <details style={{ marginTop: "2.4rem" }}>
            <summary>Receipt JSON</summary>
            <pre>{JSON.stringify(r.receipt, null, 2)}</pre>
          </details>
          {cf?.resolution && (
            <details style={{ marginTop: "1.2rem" }}>
              <summary>Outcome record JSON</summary>
              <pre>{JSON.stringify({ ...cf.resolution, signature: cf.resolutionSignature }, null, 2)}</pre>
            </details>
          )}
        </div>
      </section>
    </>
  );
}
