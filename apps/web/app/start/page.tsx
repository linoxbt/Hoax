"use client";
// Step 1: connect the wallet, verify it, and find its dreamDEX trading account.
import { StepNav } from "@/components/StepNav";
import { Avatar } from "@/components/WalletButton";
import { DREAMDEX_APP, addressUrl, health, short, usd } from "@/lib/format";
import { useHoax } from "@/lib/wallet";

export default function WalletStep() {
  const hoax = useHoax();
  const info = hoax.walletInfo;
  const margin = info?.margin ?? null;

  const rows: Array<{ k: string; ok: boolean; v: React.ReactNode; act?: React.ReactNode }> = [
    {
      k: "Wallet",
      ok: Boolean(hoax.wallet),
      v: hoax.wallet ? (
        <span className="row" style={{ gap: 8 }}>
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
      ok: Boolean(hoax.wallet) && hoax.onHideki,
      v: "Somnia Hideki · 50383",
      act: hoax.wallet && !hoax.onHideki && (
        <button className="pill" onClick={() => void hoax.ensureChain().catch(() => {})}>
          Switch
        </button>
      ),
    },
    {
      k: "Verified",
      ok: hoax.signedIn,
      v: hoax.signedIn ? "Signed in" : "Free signature, no transaction",
      act: hoax.wallet && hoax.onHideki && !hoax.signedIn && (
        <button className="pill" onClick={hoax.openConnect}>
          Verify
        </button>
      ),
    },
    {
      k: "dreamDEX account",
      ok: Boolean(hoax.account),
      v: hoax.account ? (
        <a className="mono" href={addressUrl(hoax.account)} target="_blank" rel="noreferrer">
          {short(hoax.account)} ↗
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
    <div className="grid g-aside" style={{ gap: 48 }}>
      <div>
        <h2>Your dreamDEX wallet</h2>
        <p className="copy soft" style={{ marginTop: 20 }}>
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
          <div className="grid g3" style={{ marginTop: 24 }}>
            <div className="card">
              <div className="cap soft">Equity</div>
              <div className="num s" style={{ marginTop: 8 }}>
                {usd(margin.equity)}
                <small>USDso</small>
              </div>
            </div>
            <div className="card">
              <div className="cap soft">Account health</div>
              <div className="num s accent" style={{ marginTop: 8 }}>
                {health(margin.health)}
              </div>
            </div>
            <div className="card">
              <div className="cap soft">Open positions</div>
              <div className="num s" style={{ marginTop: 8 }}>
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
