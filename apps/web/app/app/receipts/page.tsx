"use client";
import { useEffect, useState } from "react";
import { AppHead } from "@/components/AppHead";
import { ReceiptTable } from "@/components/ReceiptRow";
import { useApp } from "@/lib/appContext";
import { api } from "@/lib/session";
import type { ActionJson } from "@/lib/types";

export default function MyReceipts() {
  const { session, setErr } = useApp();
  const [actions, setActions] = useState<ActionJson[] | null>(null);
  useEffect(() => {
    setActions(null);
    api<ActionJson[]>(`/api/actions?owner=${session.owner}&chain=${session.chainId}&limit=200`).then(setActions, (e) => setErr((e as Error).message));
  }, [session.owner, session.chainId, setErr]);
  return (
    <>
      <AppHead kicker="Receipts" title="Receipts" />
      <div className="wrap pad-s">
        {!actions && <p className="copy soft"><span className="spin" aria-hidden /> Loading receipts…</p>}
        {actions && actions.length === 0 && <p className="copy soft">No receipts yet. Hoax writes one every time it acts or decides not to.</p>}
        {actions && actions.length > 0 && <ReceiptTable actions={actions} />}
        <p className="cap soft" style={{ marginTop: "2.4rem" }}>
          Public · signed by this wallet&apos;s Hoax key
        </p>
      </div>
    </>
  );
}
