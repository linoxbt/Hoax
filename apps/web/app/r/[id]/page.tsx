import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
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
    <div className="stack">
      <div className="spread">
        <h1>
          {r.market} {r.side} receipt
        </h1>
        <OutcomeBadge outcome={r.outcome} />
      </div>
      {r.reason && <div className={`notice ${r.outcome === "missed" || r.outcome === "conflict" ? "bad" : ""}`}>{r.reason}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h3>What Hoax did</h3>
          <dl className="kv">
            <dt>Account</dt>
            <dd className="mono">
              <a href={addressUrl(r.owner)}>{r.owner}</a>
            </dd>
            <dt>Closed</dt>
            <dd className="mono">
              {units(r.sizeFilled, d)} of {units(r.sizeBefore, d)} (asked {units(r.sizeRequested, d)})
            </dd>
            <dt>Left open</dt>
            <dd className="mono">{units(r.sizeAfter, d)}</dd>
            <dt>Average fill</dt>
            <dd className="mono">{usd(r.avgPrice)}</dd>
            <dt>Mark at close</dt>
            <dd className="mono">{usd(r.mark)}</dd>
            <dt>Transaction</dt>
            <dd className="mono">{r.txHash ? <a href={txUrl(r.txHash)}>{r.txHash.slice(0, 18)}…</a> : "none sent"}</dd>
            <dt>Block</dt>
            <dd className="mono">{r.block?.toString() ?? "–"}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Health and cost</h3>
          <dl className="kv">
            <dt>Health</dt>
            <dd className="mono">
              {health(r.healthBefore)} → {health(r.healthAfter)}
            </dd>
            <dt>Liquidation price</dt>
            <dd className="mono">
              {usd(r.liqPriceBefore)} → {usd(r.liqPriceAfter)}
            </dd>
            <dt>Close cost</dt>
            <dd className="mono">{r.cost !== null ? `${usd(r.cost, 4)} USDso` : "–"}</dd>
            <dt>Estimated beforehand</dt>
            <dd className="mono">{r.estCloseCost !== null ? `${usd(r.estCloseCost, 4)} USDso` : "–"}</dd>
            <dt>Liquidation would cost</dt>
            <dd className="mono">{r.estLiqCost !== null ? `${usd(r.estLiqCost)} USDso` : "–"}</dd>
            <dt>Builder fee</dt>
            <dd className="mono">{Number(r.builderFee1k) / 1000} bps</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <h3>Was it needed?</h3>
        {r.outcome === "pending" && (
          <p>
            Hoax is watching the mark for 24 hours. If it reaches {usd(r.liqPriceBefore)}, the liquidation price before the
            close, while the reduced position survives, this becomes a save.
          </p>
        )}
        {r.outcome === "saved" && cf && (
          <dl className="kv">
            <dt>Reached old liquidation price at block</dt>
            <dd className="mono">{cf.reachedAtBlock?.toString()}</dd>
            <dt>Equity held then</dt>
            <dd className="mono">{usd(cf.equityAtReach)} USDso</dd>
            <dt>Equity if liquidated</dt>
            <dd className="mono">{usd(cf.equityIfLiquidated)} USDso</dd>
            <dt>Equity preserved</dt>
            <dd className="mono" style={{ color: "var(--saved)", fontWeight: 700 }}>
              {usd(cf.preserved)} USDso
            </dd>
          </dl>
        )}
        {r.outcome === "not-needed" && (
          <p>The mark never reached the old liquidation price within 24 hours. The close cost was the price of insurance.</p>
        )}
        {(r.outcome === "skipped" || r.outcome === "missed" || r.outcome === "conflict") && (
          <p className="muted">No counterfactual: {r.reason ?? r.outcome}.</p>
        )}
        <p className="small muted">
          Equity preserved = equity held when the mark reached the old liquidation price, minus the equity left after a
          liquidation there (maintenance margin at that price, less the 1% penalty and the forced-close slippage). The close
          cost was already paid out of the first number, so it is not subtracted twice.
        </p>
      </div>

      <div className="card">
        <h3>Check it yourself</h3>
        <dl className="kv">
          <dt>Receipt hash</dt>
          <dd className="mono">{r.receiptHash || "–"}</dd>
          <dt>Signed by Hoax key</dt>
          <dd className="mono">
            <a href={addressUrl(String(r.receipt.hoaxKey))}>{String(r.receipt.hoaxKey)}</a>
          </dd>
          <dt>Signature</dt>
          <dd>
            {r.signatureValid === true && <span className="badge saved">valid</span>}
            {r.signatureValid === false && <span className="badge missed">does not match</span>}
            {r.signatureValid === null && <span className="muted">unsigned</span>}
          </dd>
        </dl>
        <p className="small muted">
          The hash is keccak256 of the receipt JSON with keys sorted; the signature is EIP-191 over those 32 bytes. Every
          field can be re-derived from the transaction and reads at its block.
        </p>
        <details>
          <summary className="small">Receipt JSON</summary>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(r.receipt, null, 2)}</pre>
        </details>
      </div>
      <div className="row">
        <CopyButton text={`/r/${r.id}`} label="Copy link to share" />
      </div>
    </div>
  );
}
