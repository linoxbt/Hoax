import Link from "next/link";
import { OutcomeBadge } from "./Outcome";
import { Arrow } from "./Ui";
import { ago, closeCost, health, units } from "@/lib/format";
import type { ActionJson } from "@/lib/types";

/** One receipt in a list: what happened, what it cost, how health moved. */
export function ReceiptRow({ a, decimals = 18 }: { a: ActionJson; decimals?: number }) {
  return (
    <tr>
      <td data-label="When">
        <Link href={`/r/${a.id}`} className="db-rlink">
          <span>{ago(a.createdAt)}</span>
          <Arrow dir="ne" />
        </Link>
      </td>
      <td data-label="Market" className="db-rmkt">
        {a.market}
      </td>
      <td data-label="Outcome">
        <OutcomeBadge outcome={a.outcome} />
      </td>
      <td data-label="Closed" className="db-rclosed">
        {a.sizeFilled !== "0" ? `${units(a.sizeFilled, decimals)} / ${units(a.sizeBefore, decimals)}` : (a.reason ?? "–")}
      </td>
      <td data-label="Health">
        {health(a.healthBefore)} <span className="db-rarr">→</span> {health(a.healthAfter)}
      </td>
      <td data-label="Cost">{closeCost(a.cost)}</td>
    </tr>
  );
}

export function ReceiptTable({ actions }: { actions: ActionJson[] }) {
  if (actions.length === 0) return <p className="cap soft">No receipts yet.</p>;
  return (
    <div className="scroll-x db-rtable">
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
