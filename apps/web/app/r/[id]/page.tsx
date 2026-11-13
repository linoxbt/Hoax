import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { Eyebrow } from "@/components/Ui";
import { OUTCOME_LABEL, OutcomeBadge } from "@/components/Outcome";
import { DEMO, getStore, isUuid } from "@/lib/server";
import { receiptView } from "@/lib/views";
import { addressUrl, closeCost, health, txUrl, units, usd } from "@/lib/format";

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
  const bad = r.outcome === "missed" || r.outcome === "conflict";

  return (
    <article className="db-r">
      <header className="db-r-head">
        <div className="db-r-title">
          <Eyebrow>Protection receipt / {r.id.slice(0, 8)}</Eyebrow>
          <h1 className="h1">
            {r.market} {r.side}
          </h1>
          <div className="db-r-meta">
            <OutcomeBadge outcome={r.outcome} />
            <span className="mono-s soft">{r.networkName}</span>
            {r.block !== null && r.block !== undefined && <span className="mono-s soft">Block {r.block.toString()}</span>}
          </div>
        </div>
        <div className="card db-r-out">
          <div className="db-card-h">
            <Eyebrow>The outcome</Eyebrow>
            <span className="db-label">Health before and after</span>
          </div>
          <div className={`h3 db-r-word ${r.outcome}`}>{OUTCOME_LABEL[r.outcome].replace(/^./, (c) => c.toUpperCase())}.</div>
          <div className="db-r-hh">
            <div>
              <span>Before</span>
              <b className={`num ${bad ? "bad" : ""}`}>{health(r.healthBefore)}</b>
            </div>
            <i aria-hidden>→</i>
            <div>
              <span>After</span>
              <b className="num accent">{health(r.healthAfter)}</b>
            </div>
          </div>
          {r.reason && <p className={`note ${bad ? "bad" : ""}`}>{r.reason}</p>}
        </div>
      </header>

      <div className="db-two">
        <section className="card db-r-card">
          <Eyebrow>01 / What Hoax did</Eyebrow>
          <div className="rows db-rows">
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
                {r.txHash ? (
                  link ? (
                    <a href={txUrl(r.txHash, r.chainId)}>{r.txHash.slice(0, 18)}… ↗</a>
                  ) : (
                    `${r.txHash.slice(0, 18)}… (sample)`
                  )
                ) : (
                  "none sent"
                )}
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
        </section>
        <section className="card db-r-card">
          <Eyebrow>02 / Health and cost</Eyebrow>
          <div className="rows db-rows">
            <div className="r">
              <span>Liquidation price</span>
              <span>
                {usd(r.liqPriceBefore)} → {usd(r.liqPriceAfter)}
              </span>
            </div>
            <div className="r">
              <span>Close cost</span>
              <span>{closeCost(r.cost, 4)}</span>
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
        </section>
      </div>

      <section className="card db-r-cf">
        <div className="db-r-cf-l">
          <Eyebrow>03 / Counterfactual</Eyebrow>
          <h2 className="h2">Was it needed?</h2>
          <p className="mono-xs soft">
            Preserved = equity at the old liquidation price − equity after liquidating the whole position there. dreamDEX liquidates in steps and can
            stop early, so this is an upper bound: what the close saved if the move had gone on to liquidate it all.
          </p>
        </div>
        <div className="panel db-r-cf-r">
          {r.outcome === "pending" && (
            <p className="txt ink">Watching for 24 h. A save if the mark reaches {usd(r.liqPriceBefore)} and the position survives.</p>
          )}
          {r.outcome === "unconfirmed" && <p className="txt ink">The close was sent and its result is being confirmed on chain.</p>}
          {r.outcome === "saved" && cf && (
            <>
              <Eyebrow>Equity preserved</Eyebrow>
              <div className="num accent db-r-saved">
                <small>up to</small> {usd(cf.preserved)}
                <small>USDso preserved</small>
              </div>
              <div className="panel-in">
                <div className="rows db-rows">
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
              </div>
            </>
          )}
          {r.outcome === "not-needed" && (
            <p className="txt ink">
              Liquidation price not reached in 24 h.{" "}
              {r.cost !== null && BigInt(r.cost) < 0n
                ? "The close filled better than the mark, so the insurance cost nothing."
                : "The close cost was insurance."}
            </p>
          )}
          {(r.outcome === "skipped" || r.outcome === "missed" || r.outcome === "conflict") && <p className="txt ink">{r.reason ?? r.outcome}</p>}
        </div>
      </section>

      <section className="dark db-r-ver">
        <div className="db-r-ver-l">
          <Eyebrow>04 / Verification</Eyebrow>
          <h2 className="h3">
            {r.signatureValid === true ? "Signature valid." : r.signatureValid === false ? "Signature does not match." : "Unsigned."}
          </h2>
          <p className="mono-xs">
            keccak256 of sorted-key JSON · EIP-191 signature. The receipt is signed when Hoax closes and never changed; the final outcome is a second
            record, signed by the same key, that names this receipt by its hash.
          </p>
          <CopyButton text={`/r/${r.id}`} label="Copy link to share" />
        </div>
        <div className="db-r-ver-r">
          <div className="db-navrows">
            <div className="r">
              <span>Receipt hash</span>
              <span>{r.receiptHash || "–"}</span>
            </div>
            <div className="r">
              <span>Signed by</span>
              {link ? (
                <a href={addressUrl(String(r.receipt.hoaxKey), r.chainId)}>{String(r.receipt.hoaxKey)}</a>
              ) : (
                <span>{String(r.receipt.hoaxKey)}</span>
              )}
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
          <details className="db-json">
            <summary>Receipt JSON</summary>
            <pre>{JSON.stringify(r.receipt, null, 2)}</pre>
          </details>
          {cf?.resolution && (
            <details className="db-json">
              <summary>Outcome record JSON</summary>
              <pre>{JSON.stringify({ ...cf.resolution, signature: cf.resolutionSignature }, null, 2)}</pre>
            </details>
          )}
        </div>
      </section>
    </article>
  );
}
