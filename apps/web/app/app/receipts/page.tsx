"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Edge } from "@/components/Bars";
import { Kicker } from "@/components/Kicker";
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
    <>
      <section className="sec char">
        <div className="wrap pad" style={{ paddingBottom: 48 }}>
          <Kicker left>Receipts</Kicker>
          <h1>Every action, signed</h1>
          {owner && (
            <p className="mono soft" style={{ marginTop: 20 }}>
              {owner}
            </p>
          )}
          {!owner && (
            <p className="copy soft" style={{ marginTop: 20 }}>
              No wallet on this browser. <Link href="/start">Start here ↗</Link>, or open /app/receipts?owner=0x…
            </p>
          )}
          {err && <p className="note bad" style={{ marginTop: 20 }}>{err}</p>}
        </div>
      </section>
      <section className="sec sand">
        <Edge color="char" seed={23} />
        <div className="wrap pad" style={{ paddingTop: 32 }}>
          {actions && <ReceiptTable actions={actions} />}
          <p className="cap soft" style={{ marginTop: 24 }}>
            Saved, not needed, skipped, missed or conflict. Every receipt is public and signed by the account&apos;s Hoax key.
          </p>
        </div>
      </section>
    </>
  );
}
