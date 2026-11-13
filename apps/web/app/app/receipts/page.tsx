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
      <AppHead
        kicker={`Receipts / ${!actions ? "–" : actions.length >= 200 ? "latest 200" : `${actions.length} on record`}`}
        title="Receipts"
        sub="Every close Hoax sent on this account, and every time it decided not to. Open one to see its signature."
      />
      <section className="card db-table-card">
        <div className="db-card-h db-in">
          <h2 className="h5">Every receipt</h2>
          <span className="db-label">Public · signed by this wallet&apos;s Hoax key</span>
        </div>
        {!actions && (
          <p className="mono-s soft db-in">
            <span className="spin" aria-hidden /> Loading receipts…
          </p>
        )}
        {actions && actions.length === 0 && <p className="txt db-in">No receipts yet. Hoax writes one every time it acts or decides not to.</p>}
        {actions && actions.length > 0 && <ReceiptTable actions={actions} />}
      </section>
    </>
  );
}
