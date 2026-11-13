"use client";
// Step 1: connect the wallet, verify it, and find its dreamDEX trading account.
import { StepNav } from "@/components/StepNav";
import { Btn, Eyebrow } from "@/components/Ui";
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
        <span className="row">
          <Avatar address={hoax.wallet} /> <span className="mono">{short(hoax.wallet)}</span>
        </span>
      ) : (
        "Not connected"
      ),
      act: !hoax.wallet && (
        <Btn fill sm onClick={hoax.openConnect}>
          Connect wallet
        </Btn>
      ),
    },
    {
      k: "Network",
      ok: Boolean(hoax.wallet) && hoax.onSupported,
      v: "Somnia Shannon or Hideki",
      act: hoax.wallet && !hoax.onSupported && (
        <Btn fill sm onClick={() => void hoax.ensureChain().catch(() => {})}>
          Switch
        </Btn>
      ),
    },
    {
      k: "Verified",
      ok: hoax.signedIn,
      v: hoax.signedIn ? "Signed in" : "Free signature, no transaction",
      act: hoax.wallet && hoax.onSupported && !hoax.signedIn && (
        <Btn fill sm onClick={hoax.openConnect}>
          Verify
        </Btn>
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
        <Btn sm href={DREAMDEX_APP} external>
          Open dreamDEX
        </Btn>
      ),
    },
  ];
  const current = rows.findIndex((r) => !r.ok);

  return (
    <article className="card st-step">
      <div className="st-grid">
        <div className="st-explain">
          <Eyebrow>Step 01 / Connect</Eyebrow>
          <h2 className="h2">Your dreamDEX wallet</h2>
          <p className="txt">Connect the wallet you trade perps with. Hoax finds its trading account on chain.</p>
          <div className="panel st-ctx">
            <Eyebrow>What this step asks for</Eyebrow>
            <div className="st-li">
              <span className="st-mk">1</span>
              <span>
                <b>A wallet connection</b>
                <small>On Somnia Shannon or Hideki, where dreamDEX runs.</small>
              </span>
            </div>
            <div className="st-li">
              <span className="st-mk">2</span>
              <span>
                <b>One free signature</b>
                <small>It proves the wallet is yours. No transaction.</small>
              </span>
            </div>
            <Eyebrow>What it never asks for</Eyebrow>
            <div className="st-li">
              <span className="st-mk no">×</span>
              <span>
                <b>A seed phrase or a withdrawal</b>
                <small>Hoax never asks for either.</small>
              </span>
            </div>
          </div>
        </div>

        <div className="st-act">
          <div className="st-checks">
            {rows.map((r, i) => (
              <div key={r.k} className={`st-ck${r.ok ? " ok" : i === current ? " now" : ""}`}>
                <span className={`st-mk${r.ok ? "" : i === current ? " now" : " num"}`}>{r.ok ? "✓" : i + 1}</span>
                <span className="st-ck-v">
                  <span className="eyebrow">{r.k}</span>
                  <span>{r.v}</span>
                </span>
                <span>{r.act}</span>
              </div>
            ))}
          </div>

          {hoax.account && margin && (
            <div className="panel st-acct">
              <div className="spread" style={{ alignItems: "center" }}>
                <Eyebrow>Your dreamDEX account / read from chain</Eyebrow>
              </div>
              <div className="st-acct-cells">
                <div className="panel-in">
                  <span className="eyebrow">Equity</span>
                  <span className="num s">
                    {usd(margin.equity)}
                    <small>USDso</small>
                  </span>
                </div>
                <div className="panel-in">
                  <span className="eyebrow">Account health</span>
                  <span className="num s accent">{health(margin.health)}</span>
                </div>
                <div className="panel-in">
                  <span className="eyebrow">Open positions</span>
                  <span className="num s">{margin.positions}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <StepNav next="/start/link" nextLabel="Link Hoax" nextDisabled={!(hoax.account && hoax.signedIn)} />
    </article>
  );
}
