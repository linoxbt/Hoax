"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReceiptTable } from "@/components/ReceiptRow";
import { api, loadSession } from "@/lib/session";
import type { ActionJson } from "@/lib/types";

export default function MyReceipts() {
  const [owner, setOwner] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionJson[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    const q = new URLSearchParams(location.search).get("owner");
    setOwner(q ?? s?.owner ?? null);
  }, []);

  useEffect(() => {
    if (!owner) return;
    api<ActionJson[]>(`/api/actions?owner=${owner}&limit=200`).then(setActions, (e) => setErr((e as Error).message));
  }, [owner]);

  return (
    <div className="stack">
      <h1>Receipts</h1>
      {!owner && (
        <p>
          No wallet on this browser. <Link href="/start">Start here</Link>, or open <code>/app/receipts?owner=0x…</code>.
        </p>
      )}
      {err && <div className="notice bad">{err}</div>}
      {owner && <p className="muted small mono">{owner}</p>}
      {actions && <ReceiptTable actions={actions} />}
      <p className="small muted">
        Green saved, grey not needed, amber skipped, red missed or conflict. Every receipt is public and signed by the
        account&apos;s Hoax key.
      </p>
    </div>
  );
}
