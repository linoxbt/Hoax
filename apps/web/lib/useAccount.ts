"use client";
// The protected account's live state from the API, shared by every page of the
// app and the onboarding flow. The session comes from the wallet (useHoax).

import { useCallback, useEffect, useState } from "react";
import { api, type Session } from "./session";
import type { AccountJson } from "./types";

export function useAccount(session: Session | null | undefined, everyMs = 5000) {
  const [view, setView] = useState<AccountJson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    const q = `?chain=${session.chainId}${session.accountId ? `&account=${session.accountId}` : ""}`;
    try {
      setView(await api<AccountJson>(`/api/accounts/${session.owner}${q}`, { token: session.token || undefined }));
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
