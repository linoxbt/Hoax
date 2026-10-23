"use client";
// The header's wallet control: Connect when nothing is connected, otherwise the
// wallet with its dreamDEX account and a small menu.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addressUrl, short } from "@/lib/format";
import { useHoax } from "@/lib/wallet";

/** A deterministic two-tone avatar from the address, in the brand's indigo range. */
export function Avatar({ address, size = 22 }: { address: string; size?: number }) {
  const n = parseInt(address.slice(2, 10), 16);
  const hue = 225 + (n % 50);
  const angle = n % 360;
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, background: `linear-gradient(${angle}deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 75% 30%))` }}
    />
  );
}

export function WalletButton() {
  const hoax = useHoax();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (hoax.sample && !hoax.wallet) {
    return (
      <button className="pill ghost chip" onClick={hoax.disconnect} title="Leave the sample account">
        Sample account ×
      </button>
    );
  }

  if (!hoax.wallet) {
    return (
      <button className="pill" onClick={hoax.openConnect} disabled={hoax.connecting}>
        {hoax.connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const needs = !hoax.onHideki ? "Wrong network" : !hoax.signedIn ? "Verify" : null;

  return (
    <div className="wmenu" ref={ref}>
      <button className={`pill ghost chip${needs ? " warn" : ""}`} onClick={() => (needs ? hoax.openConnect() : setOpen(!open))} aria-expanded={open}>
        <Avatar address={hoax.wallet} />
        <span className="mono">{short(hoax.wallet)}</span>
        {needs && <span className="badge">{needs}</span>}
      </button>
      {open && (
        <div className="wdrop">
          <div className="cap soft">Wallet</div>
          <div className="mono">{short(hoax.wallet)}</div>
          <div className="cap soft" style={{ marginTop: 14 }}>
            dreamDEX account
          </div>
          <div className="mono">{hoax.account ? short(hoax.account) : hoax.walletInfo ? "None yet" : "Reading…"}</div>
          <div className="wlinks">
            <Link href="/app" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
            {hoax.account && (
              <a href={addressUrl(hoax.account)} target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            )}
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(hoax.wallet!);
                setOpen(false);
              }}
            >
              Copy address
            </button>
            <button
              onClick={() => {
                hoax.disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
