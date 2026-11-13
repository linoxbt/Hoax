"use client";
// The wallet cell: Connect when nothing is connected, otherwise the wallet with
// its dreamDEX account and a small menu that drops out of the header.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NETWORK_NAMES, addressUrl, short } from "@/lib/format";
import { useHoax } from "@/lib/wallet";
import { Arrow } from "./Ui";

/** A deterministic square identicon: a 3x3 field of the address's bits in navy and blue. */
export function Avatar({ address, size = 20 }: { address: string; size?: number }) {
  const n = BigInt(address.slice(0, 18));
  const cells = Array.from({ length: 9 }, (_, i) => Number((n >> BigInt(i * 3)) & 7n));
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 3 3" aria-hidden shapeRendering="crispEdges">
      <rect width="3" height="3" fill="#101b35" />
      {cells.map((v, i) =>
        v > 3 ? <rect key={i} x={i % 3} y={Math.floor(i / 3)} width="1" height="1" fill={v === 7 ? "#8db7ff" : "#1954f5"} /> : null,
      )}
    </svg>
  );
}

export function WalletButton() {
  const hoax = useHoax();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (hoax.sample && !hoax.wallet) {
    return (
      <button className="st-wbtn sample" onClick={hoax.disconnect} title="Leave the sample account">
        <span>Sample account</span>
        <span className="st-wbtn-x">× Leave</span>
      </button>
    );
  }

  if (!hoax.wallet) {
    return (
      <button className="st-wbtn connect" onClick={hoax.openConnect} disabled={hoax.connecting}>
        <span>{hoax.connecting ? "Connecting" : "Connect wallet"}</span>
        <Arrow />
      </button>
    );
  }

  const needs = !hoax.onSupported ? "Wrong network" : !hoax.signedIn ? "Verify wallet" : null;

  return (
    <div className="st-wb" ref={ref}>
      <button
        ref={button}
        className="st-wbtn"
        onClick={() => (needs ? hoax.openConnect() : setOpen(!open))}
        aria-expanded={open}
        aria-haspopup={needs ? "dialog" : "menu"}
      >
        <Avatar address={hoax.wallet} size={30} />
        <span>{short(hoax.wallet)}</span>
        {needs ? (
          <span className="st-wbtn-need">{needs}</span>
        ) : (
          <svg className="st-wbtn-car" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 4.5l3 3 3-3" />
          </svg>
        )}
      </button>
      {open && (
        <div className="st-wdrop" role="menu" aria-label="Wallet">
          <div className="st-wd-id">
            <div>
              <span className="eyebrow">Wallet</span>
              <span className="st-wd-val">{hoax.wallet}</span>
            </div>
            <div>
              <span className="eyebrow">dreamDEX account{hoax.accountChain ? ` / ${NETWORK_NAMES[hoax.accountChain]}` : ""}</span>
              <span className="st-wd-val">{hoax.account ?? (hoax.walletInfo ? "None yet" : "Reading chain…")}</span>
            </div>
          </div>
          <div className="st-wd-links">
            <Link href="/app" onClick={() => setOpen(false)}>
              Dashboard
              <Arrow />
            </Link>
            {hoax.account && (
              <a href={addressUrl(hoax.account, hoax.accountChain ?? undefined)} target="_blank" rel="noreferrer">
                View on explorer
                <Arrow dir="ne" />
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
              className="st-wd-out"
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
