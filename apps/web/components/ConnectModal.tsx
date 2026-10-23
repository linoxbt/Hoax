"use client";
// Connect, switch to Hideki, sign in: one dialog, three checks, every wallet the
// browser has installed listed by name (EIP-6963).

import { useEffect, useState } from "react";
import { useAccount, useConnect, useConnectors, type Connector } from "wagmi";
import { short } from "@/lib/format";
import { useHoax } from "@/lib/wallet";

const INSTALL = [
  ["MetaMask", "https://metamask.io/download/"],
  ["Rabby", "https://rabby.io/"],
  ["OKX Wallet", "https://www.okx.com/web3"],
] as const;

function WalletIcon({ c }: { c: Connector }) {
  if (c.icon) return <img src={c.icon} alt="" width={28} height={28} style={{ borderRadius: 8 }} />;
  return (
    <span className="wicon" aria-hidden>
      {c.name.slice(0, 1)}
    </span>
  );
}

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const { address } = useAccount();
  const hoax = useHoax();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Close once everything is done.
  useEffect(() => {
    if (open && address && hoax.onHideki && hoax.signedIn) {
      const t = setTimeout(onClose, 700);
      return () => clearTimeout(t);
    }
  }, [open, address, hoax.onHideki, hoax.signedIn, onClose]);

  if (!open) return null;

  // Named wallets from EIP-6963 first; the generic injected one only when nothing named is found.
  const named = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const list = named.length > 0 ? named : connectors.filter((c) => c.id === "injected" && typeof window !== "undefined" && "ethereum" in window);

  async function pick(c: Connector) {
    setErr(null);
    setBusy(c.uid);
    try {
      await connectAsync({ connector: c, chainId: undefined });
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  async function run(step: "chain" | "sign") {
    setErr(null);
    setBusy(step);
    try {
      if (step === "chain") await hoax.ensureChain();
      else await hoax.signIn();
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  const steps = [
    { k: "Connect", done: Boolean(address), detail: address ? short(address) : "Choose a wallet" },
    { k: "Network", done: Boolean(address) && hoax.onHideki, detail: "Somnia Hideki · 50383" },
    { k: "Verify", done: hoax.signedIn, detail: "Free signature, no transaction" },
  ];

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Connect a wallet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Connect · Somnia Hideki</span>
          <button className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
        <h3 className="h4">Your dreamDEX wallet</h3>

        <ol className="checks">
          {steps.map((s, i) => (
            <li key={s.k} className={s.done ? "done" : i === steps.findIndex((x) => !x.done) ? "now" : ""}>
              <span className="dot">{s.done ? "✓" : i + 1}</span>
              <span>
                <b>{s.k}</b>
                <small>{s.detail}</small>
              </span>
            </li>
          ))}
        </ol>

        {!address ? (
          <div className="wallets">
            {list.map((c) => (
              <button key={c.uid} className="wallet" onClick={() => pick(c)} disabled={busy !== null}>
                <WalletIcon c={c} />
                <span>{c.name === "Injected" ? "Browser wallet" : c.name}</span>
                <span className="mono-xs soft">{busy === c.uid ? "Opening…" : "Detected →"}</span>
              </button>
            ))}
            {list.length === 0 && (
              <div className="nowallet">
                <p className="copy soft">No wallet found in this browser.</p>
                <div className="row" style={{ marginTop: "1.2rem" }}>
                  {INSTALL.map(([name, href]) => (
                    <a key={name} className="pill ghost" href={href} target="_blank" rel="noreferrer">
                      {name} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : !hoax.onHideki ? (
          <button className="pill wide" onClick={() => run("chain")} disabled={busy !== null}>
            {busy === "chain" ? "Confirm in wallet…" : "Switch to Somnia Hideki"}
          </button>
        ) : !hoax.signedIn ? (
          <button className="pill wide" onClick={() => run("sign")} disabled={busy !== null}>
            {busy === "sign" ? "Sign in your wallet…" : "Verify wallet"}
          </button>
        ) : (
          <p className="note">
            Connected and verified.
          </p>
        )}

        {err && (
          <p className="note bad" style={{ marginTop: "1.6rem" }}>
            {err}
          </p>
        )}

        <p className="mono-xs soft" style={{ marginTop: "2.4rem", textAlign: "center" }}>
          Hoax never asks for a seed phrase or a withdrawal.
        </p>
        {!address && process.env.NEXT_PUBLIC_HOAX_DEMO === "1" && (
          <button className="linkish" onClick={hoax.useSample}>
            No wallet? Explore with a sample account →
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

function friendly(e: unknown): string {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e);
  if (/reject|denied|cancel/i.test(m)) return "Request cancelled in the wallet.";
  if (/already pending/i.test(m)) return "Your wallet already has a request open. Check the extension.";
  return m.split("\n")[0].slice(0, 200);
}
