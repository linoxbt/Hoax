import type { Outcome } from "@/lib/types";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  saved: "saved",
  "not-needed": "not needed",
  skipped: "skipped",
  missed: "missed",
  conflict: "conflict",
  pending: "watching 24h",
  unconfirmed: "confirming",
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return <span className={`tag ${outcome}`}>{OUTCOME_LABEL[outcome]}</span>;
}
