import type { Outcome } from "@/lib/types";

const LABEL: Record<Outcome, string> = {
  saved: "saved",
  "not-needed": "not needed",
  skipped: "skipped",
  missed: "missed",
  conflict: "conflict",
  pending: "watching 24h",
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return <span className={`badge ${outcome}`}>{LABEL[outcome]}</span>;
}
