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
    api<ActionJson[]>(`/api/actions?owner=${session.owner}&limit=200`).then(setActions, (e) => setErr((e as Error).message));
  }, [session.owner, setErr]);
  return (
    <>
      <AppHead kicker="Receipts" title="Every action, signed" />
      <div className="wrap pad-s">
        {actions && <ReceiptTable actions={actions} />}
        <p className="cap soft" style={{ marginTop: 24 }}>
          Every receipt is public and signed by this wallet&apos;s Hoax key. Open one to see its counterfactual and check the signature.
        </p>
      </div>
    </>
  );
}
