"use client";
import { createContext, useContext } from "react";
import type { Session } from "./session";
import type { AccountJson, PolicyJson } from "./types";

export interface AppState {
  session: Session;
  view: AccountJson | null;
  err: string | null;
  setErr: (e: string | null) => void;
  refresh: () => Promise<void>;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const s = useContext(AppContext);
  if (!s) throw new Error("useApp outside the app layout");
  return s;
}

export const DEFAULT_POLICY_JSON: Omit<PolicyJson, "market"> = {
  triggerHealth: 1.25,
  targetHealth: 1.6,
  maxClosePct: 50,
  maxSlippageBps: 30,
  cooldownSec: 30,
  floorSize: null,
  lambda: 0.5,
  triggerMargin: 0.02,
  allowFullClose: true,
  enabled: false,
};
