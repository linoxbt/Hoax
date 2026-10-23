"use client";
// Step 3: the Hoax key pays for its own closes in STT. The engine's gas wallet
// tops it up when one is configured; the trader can also send some directly.
import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import { StepNav } from "@/components/StepNav";
import { short, txUrl } from "@/lib/format";
import { useStart } from "@/lib/startContext";
import { friendly } from "@/lib/useLinkTx";
import { useHoax, wagmiConfig } from "@/lib/wallet";

const AMOUNT = "0.1";

export default function GasStep() {
  const hoax = useHoax();
  const { view, linked, refresh } = useStart();
  const [hash, setHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = view?.account?.hoaxKey ?? null;
  const gas = view?.keyBalance ? BigInt(view.keyBalance) : null;
  const low = gas !== null && gas < 10n ** 16n;
  const sponsored = Boolean(hoax.engine?.info?.gasWallet);

  async function fund() {
    if (!hoax.wallet || !key) return;
    setErr(null);
    setBusy(true);
    try {
      await hoax.ensureChain();
      const h = await sendTransaction(wagmiConfig, { account: hoax.wallet, to: key as `0x${string}`, value: parseEther(AMOUNT) });
      setHash(h);
      await waitForTransactionReceipt(wagmiConfig, { hash: h });
      await refresh();
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid g-aside" style={{ gap: 48 }}>
      <div>
        <h2>Gas for Hoax&apos;s closes</h2>
        <p className="copy soft" style={{ marginTop: 20 }}>
          Each protective close is one transaction from your Hoax key.
        </p>
      </div>
      <div>
        {!linked ? (
          <p className="copy soft">Link Hoax first.</p>
        ) : (
          <>
            <div className="num accent">
              {gas !== null ? Number(formatEther(gas)).toFixed(4) : "–"}
              <small>STT on {short(key)}</small>
            </div>
            <p className="copy" style={{ marginTop: 16 }}>
              {gas === null ? "Balance unavailable." : low ? (sponsored ? "Low. Hoax's gas wallet tops it up automatically." : "Low. Send some to keep protection running.") : "Ready."}
            </p>
            <div className="row" style={{ marginTop: 20 }}>
              <button className={`pill${low && !sponsored ? "" : " ghost"}`} disabled={busy || !hoax.wallet} onClick={fund}>
                {busy ? "Sending…" : `Send ${AMOUNT} STT from my wallet`}
              </button>
              {hash && (
                <a className="cap accent" href={txUrl(hash)} target="_blank" rel="noreferrer">
                  {short(hash)} ↗
                </a>
              )}
            </div>
            {err && (
              <p className="note bad" style={{ marginTop: 16 }}>
                {err}
              </p>
            )}
          </>
        )}
        <StepNav back="/start/link" next="/start/policy" nextLabel="Policy" nextDisabled={!linked} />
      </div>
    </div>
  );
}
