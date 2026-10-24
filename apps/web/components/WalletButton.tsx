"use client";
// The wallet cell: Connect when nothing is connected, otherwise the wallet with
// its dreamDEX account and a small menu that drops out of the header.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NETWORK_NAMES, addressUrl, short } from "@/lib/format";
import { useHoax } from "@/lib/wallet";
import { Arrow, Roll } from "./Ui";

/** A deterministic square identicon: a 3x3 field of the address's bits in ink and orange. */
export function Avatar({ address, size = 20 }: { address: string; size?: number }) {
  const n = BigInt(address.slice(0, 18));
  const cells = Array.from({ length: 9 }, (_, i) => Number((n >> BigInt(i * 3)) & 7n));
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 3 3" aria-hidden shapeRendering="crispEdges">
      <rect width="3" height="3" fill="#f5f5ef" />
      {cells.map((v, i) =>
        v > 3 ? <rect key={i} x={i % 3} y={Math.floor(i / 3)} width="1" height="1" fill={v === 7 ? "#fa3600" : "#282828"} /> : null,
      )}
      <rect width="3" height="3" fill="none" stroke="#282828" strokeWidth="0.12" />
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
      <button className="wbtn" onClick={hoax.disconnect} title="Leave the sample account">
        <Roll>Sample account</Roll>
        <span className="mono-xs soft" style={{ position: "absolute", left: "1.2rem", bottom: "1rem" }}>
          × Leave
        </span>
      </button>
    );
  }

  if (!hoax.wallet) {
    return (
      <button className="wbtn connect" onClick={hoax.openConnect} disabled={hoax.connecting}>
        <Roll>{hoax.connecting ? "Connecting" : "Connect wallet"}</Roll>
        <Arrow />
      </button>
    );
  }

  const needs = !hoax.onSupported ? "Wrong network" : !hoax.signedIn ? "Verify wallet" : null;

  return (
    <div className="wmenu" ref={ref}>
      <button
        ref={button}
        className="wbtn"
        onClick={() => (needs ? hoax.openConnect() : setOpen(!open))}
        aria-expanded={open}
        aria-haspopup={needs ? "dialog" : "menu"}
      >
        <Avatar address={hoax.wallet} />
        <span style={{ textTransform: "none" }}>{short(hoax.wallet)}</span>
        {needs && <span className="badge">● {needs}</span>}
        {!needs && <span className="corner" style={{ position: "absolute", right: "0.6rem", bottom: "0.6rem", width: "0.6rem", height: "0.6rem", borderRight: "var(--b) solid var(--ink-4)", borderBottom: "var(--b) solid var(--ink-4)" }} aria-hidden />}
      </button>
      {open && (
        <div className="wdrop" role="menu" aria-label="Wallet">
          <div className="blk">
            <div className="mono-s soft">Wallet</div>
            <div className="val">{hoax.wallet}</div>
          </div>
          <div className="blk">
            <div className="mono-s soft">dreamDEX account{hoax.accountChain ? ` · ${NETWORK_NAMES[hoax.accountChain]}` : ""}</div>
            <div className="val">{hoax.account ?? (hoax.walletInfo ? "None yet" : "Reading chain…")}</div>
          </div>
          <div className="wlinks">
            <Link href="/app" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
            {hoax.account && (
              <a href={addressUrl(hoax.account, hoax.accountChain ?? undefined)} target="_blank" rel="noreferrer">
                View on explorer ↗
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
