import Link from "next/link";
import { OutcomeBadge } from "./Outcome";
import { ago, health, units, usd } from "@/lib/format";
import type { ActionJson } from "@/lib/types";

/** One receipt in a list: what happened, what it cost, how health moved. */
export function ReceiptRow({ a, decimals = 18 }: { a: ActionJson; decimals?: number }) {
  return (
    <tr>
      <td>
        <Link href={`/r/${a.id}`}>{ago(a.createdAt)}</Link>
      </td>
      <td>{a.market}</td>
      <td>
        <OutcomeBadge outcome={a.outcome} />
      </td>
      <td className="mono">
        {a.sizeFilled !== "0" ? `${units(a.sizeFilled, decimals)} of ${units(a.sizeBefore, decimals)}` : a.reason ?? "–"}
      </td>
      <td className="mono">
        {health(a.healthBefore)} → {health(a.healthAfter)}
      </td>
      <td className="mono">{a.cost ? `${usd(a.cost)} USDso` : "–"}</td>
    </tr>
  );
}

export function ReceiptTable({ actions }: { actions: ActionJson[] }) {
  if (actions.length === 0) return <p className="muted">No receipts yet.</p>;
  return (
    <div className="scroll-x">
      <table className="list">
        <thead>
          <tr>
            <th>When</th>
            <th>Market</th>
            <th>Outcome</th>
            <th>Closed</th>
            <th>Health</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <ReceiptRow key={a.id} a={a} decimals={a.baseDecimals ?? 18} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
