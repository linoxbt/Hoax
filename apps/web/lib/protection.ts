// Whether Hoax is actually protecting an account right now: registered and
// linked (active), not paused, and the engine for its network alive. Every
// page that says "protected" asks this, so none of them claims protection the
// engine is not giving.

import type { AccountJson, EngineJson, PolicyJson } from "./types";

export type ProtectionState = "loading" | "protecting" | "engine-offline" | "demo" | "paused" | "setting-up" | "unlinked" | "not-protected";

export const PROTECTION_TITLE: Record<ProtectionState, string> = {
  loading: "Loading",
  protecting: "Protecting",
  "engine-offline": "Engine offline",
  demo: "Sample data",
  paused: "Paused",
  "setting-up": "Setting up",
  unlinked: "Unlinked",
  "not-protected": "Not protected",
};

export function engineOnline(engine: EngineJson | null, chainId: number): boolean | null {
  if (!engine) return null;
  if (engine.mode === "demo") return false;
  return engine.networks?.[String(chainId)]?.online ?? false;
}

export function protectionState(view: AccountJson | null, engine: EngineJson | null): ProtectionState {
  if (!view) return "loading";
  const account = view.account;
  if (!account) return "not-protected";
  if (account.status === "pending_key" || account.status === "pending_link") return "setting-up";
  if (account.status === "unlinked" || account.status === "retired") return "unlinked";
  if (account.paused) return "paused";
  if (engine?.mode === "demo") return "demo";
  const online = engineOnline(engine, view.chainId);
  if (online === null) return "loading";
  return online ? "protecting" : "engine-offline";
}

/** The tag on one position: protected only when its policy is on and the account is being protected. */
export function positionTag(view: AccountJson, engine: EngineJson | null, policy: PolicyJson | undefined): { cls: string; text: string } | null {
  if (!view.isOwner) return null; // policies are the owner's to see
  if (!policy?.enabled) return { cls: "not-needed", text: "not protected" };
  const state = protectionState(view, engine);
  if (state === "protecting") return { cls: "saved", text: "protected" };
  if (state === "demo") return { cls: "pending", text: "sample" };
  return { cls: "missed", text: `policy on · ${PROTECTION_TITLE[state].toLowerCase()}` };
}
