"use client";
// The wallet this browser manages, and its live state from the API, shared by
// every page of the app and the onboarding flow.

import { useCallback, useEffect, useState } from "react";
import { api, clearSession, loadSession, saveSession, type Session } from "./session";
import type { AccountJson } from "./types";

/** undefined while loading from storage, null when this browser manages no wallet. */
export function useSession() {
  const [session, setSessionState] = useState<Session | null | undefined>(undefined);
  useEffect(() => setSessionState(loadSession()), []);
  const setSession = useCallback((s: Session | null) => {
    if (s) saveSession(s);
    else clearSession();
    setSessionState(s);
  }, []);
  return [session, setSession] as const;
}

export function useAccount(session: Session | null | undefined, everyMs = 5000) {
  const [view, setView] = useState<AccountJson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    const q = session.accountId ? `?account=${session.accountId}` : "";
    try {
      setView(await api<AccountJson>(`/api/accounts/${session.owner}${q}`, { token: session.token }));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const t = setInterval(refresh, everyMs);
    return () => clearInterval(t);
  }, [session, refresh, everyMs]);

  return { view, err, refresh, setErr };
}
