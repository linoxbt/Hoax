"use client";
import { createContext, useContext } from "react";
import type { Session } from "./session";
import type { AccountJson } from "./types";

export interface StartState {
  session: Session | null | undefined;
  setSession: (s: Session | null) => void;
  view: AccountJson | null;
  err: string | null;
  setErr: (e: string | null) => void;
  refresh: () => Promise<void>;
  linked: boolean;
}

export const StartContext = createContext<StartState | null>(null);

export function useStart(): StartState {
  const s = useContext(StartContext);
  if (!s) throw new Error("useStart outside the onboarding layout");
  return s;
}
