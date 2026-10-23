"use client";
// Step 1: connect the wallet, verify it, and find its dreamDEX trading account.
import { StepNav } from "@/components/StepNav";
import { Avatar } from "@/components/WalletButton";
import { DREAMDEX_APP, NETWORK_NAMES, addressUrl, health, short, usd } from "@/lib/format";
import { useHoax } from "@/lib/wallet";

export default function WalletStep() {
  const hoax = useHoax();
  const info = hoax.walletInfo;
  const shown = info?.accounts.find((a) => a.address === hoax.account && a.chainId === hoax.accountChain) ?? null;
  const margin = shown && shown.equity !== null ? { equity: shown.equity, health: shown.health, positions: shown.positions } : null;

  const rows: Array<{ k: string; ok: boolean; v: React.ReactNode; act?: React.ReactNode }> = [
    {
      k: "Wallet",
      ok: Boolean(hoax.wallet),
      v: hoax.wallet ? (
        <span className="row" style={{ gap: "0.8rem" }}>
          <Avatar address={hoax.wallet} /> <span className="mono">{short(hoax.wallet)}</span>
        </span>
      ) : (
        "Not connected"
      ),
      act: !hoax.wallet && (
        <button className="pill" onClick={hoax.openConnect}>
          Connect wallet
        </button>
      ),
    },
    {
      k: "Network",
      ok: Boolean(hoax.wallet) && hoax.onSupported,
      v: "Somnia Shannon or Hideki",
      act: hoax.wallet && !hoax.onSupported && (
        <button className="pill" onClick={() => void hoax.ensureChain().catch(() => {})}>
          Switch
        </button>
      ),
    },
    {
      k: "Verified",
      ok: hoax.signedIn,
      v: hoax.signedIn ? "Signed in" : "Free signature, no transaction",
      act: hoax.wallet && hoax.onSupported && !hoax.signedIn && (
        <button className="pill" onClick={hoax.openConnect}>
          Verify
        </button>
      ),
    },
    {
      k: "dreamDEX account",
      ok: Boolean(hoax.account),
      v: hoax.account ? (
        <a className="mono" href={addressUrl(hoax.account, hoax.accountChain ?? undefined)} target="_blank" rel="noreferrer">
          {short(hoax.account)} ↗ <span className="cap soft">{NETWORK_NAMES[hoax.accountChain ?? 0]}</span>
        </a>
      ) : !hoax.wallet ? (
        "–"
      ) : info ? (
        "None found for this wallet"
      ) : (
        "Reading chain…"
      ),
      act: info && !info.primary && (
        <a className="pill ghost" href={DREAMDEX_APP} target="_blank" rel="noreferrer">
          Open dreamDEX ↗
        </a>
      ),
    },
  ];

  return (
    <div className="grid g-aside" style={{ gap: "4.8rem" }}>
      <div>
        <h2>Your dreamDEX wallet</h2>
        <p className="copy soft" style={{ marginTop: "2rem" }}>
          Connect the wallet you trade perps with. Hoax finds its trading account on chain.
        </p>
      </div>
      <div>
        <div className="checklist">
          {rows.map((r) => (
            <div key={r.k} className={r.ok ? "ok" : ""}>
              <span className="dot">{r.ok ? "✓" : ""}</span>
              <span className="cap soft">{r.k}</span>
              <span>{r.v}</span>
              <span>{r.act}</span>
            </div>
          ))}
        </div>

        {hoax.account && margin && (
          <div className="grid g3" style={{ marginTop: "2.4rem" }}>
            <div className="card">
              <div className="cap soft">Equity</div>
              <div className="num s" style={{ marginTop: "0.8rem" }}>
                {usd(margin.equity)}
                <small>USDso</small>
              </div>
            </div>
            <div className="card">
              <div className="cap soft">Account health</div>
              <div className="num s accent" style={{ marginTop: "0.8rem" }}>
                {health(margin.health)}
              </div>
            </div>
            <div className="card">
              <div className="cap soft">Open positions</div>
              <div className="num s" style={{ marginTop: "0.8rem" }}>
                {margin.positions}
              </div>
            </div>
          </div>
        )}

        <StepNav next="/start/link" nextLabel="Link Hoax" nextDisabled={!(hoax.account && hoax.signedIn)} />
      </div>
    </div>
  );
}
