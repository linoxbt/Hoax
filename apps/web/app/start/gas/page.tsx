"use client";
// Step 3: the Hoax key pays for its own closes in STT. The engine's gas wallet
// tops it up when one is configured; the trader can also send some directly.
import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import { StepNav } from "@/components/StepNav";
import { Btn, Eyebrow } from "@/components/Ui";
import { KEY_GAS_FLOOR, short, txUrl } from "@/lib/format";
import { useStart } from "@/lib/startContext";
import { friendly } from "@/lib/useLinkTx";
import { useHoax, wagmiConfig } from "@/lib/wallet";

const AMOUNT = "0.3";

export default function GasStep() {
  const hoax = useHoax();
  const { view, linked, refresh } = useStart();
  const [hash, setHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = view?.account?.hoaxKey ?? null;
  const gas = view?.keyBalance ? BigInt(view.keyBalance) : null;
  const low = gas !== null && gas < KEY_GAS_FLOOR;
  const chainId = hoax.session?.chainId ?? 50383;
  // The gas wallet of this account's own network's engine, not whichever engine beat last.
  const sponsored = Boolean(hoax.engine?.networks?.[String(chainId)]?.info?.gasWallet);

  async function fund() {
    if (!hoax.wallet || !key) return;
    setErr(null);
    setBusy(true);
    try {
      await hoax.ensureChain(chainId);
      const h = await sendTransaction(wagmiConfig(), { chainId: chainId, account: hoax.wallet, to: key as `0x${string}`, value: parseEther(AMOUNT) });
      setHash(h);
      const receipt = await waitForTransactionReceipt(wagmiConfig(), { hash: h, chainId: chainId });
      if (receipt.status !== "success") throw new Error("The transfer reverted on chain; nothing was sent.");
      await refresh();
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card st-step">
      <div className="st-grid">
        <div className="st-explain">
          <Eyebrow>Step 03 / Gas</Eyebrow>
          <h2 className="h2">Gas for Hoax&apos;s closes</h2>
          <p className="txt">Each protective close is one transaction from your Hoax key.</p>
          <div className="panel st-ctx">
            <Eyebrow>How the key&apos;s gas works</Eyebrow>
            <div className="st-li">
              <span className="st-mk">1</span>
              <span>
                <b>Paid in STT by the key</b>
                <small>Below {formatEther(KEY_GAS_FLOOR)} STT the balance counts as low.</small>
              </span>
            </div>
            <div className="st-li">
              <span className="st-mk">2</span>
              <span>
                <b>{sponsored ? "Topped up by Hoax's gas wallet" : `Topped up by you`}</b>
                <small>
                  {sponsored
                    ? `This network's engine refills a low key automatically. You can still send some yourself.`
                    : `Send ${AMOUNT} STT from your wallet to the key in one transfer.`}
                </small>
              </span>
            </div>
          </div>
        </div>

        <div className="st-act">
          {!linked ? (
            <p className="txt">Link Hoax first.</p>
          ) : (
            <div className="st-box st-bal">
              <div className="st-bal-top">
                <span className="eyebrow">Key balance / STT</span>
                {gas !== null && <span className={`tag ${low ? "skipped" : "saved"}`}>{low ? "Low" : "Ready"}</span>}
              </div>
              <div className={`num${low ? "" : " accent"}`}>
                {gas !== null ? Number(formatEther(gas)).toFixed(4) : "–"}
                <small>STT on {short(key)}</small>
              </div>
              <p className="st-bal-line">
                {gas === null ? "Balance unavailable." : low ? (sponsored ? "Low. Hoax's gas wallet tops it up automatically." : "Low. Send some to keep protection running.") : "Ready."}
              </p>
              <div className="st-act-row bt" style={{ paddingTop: "2rem", marginTop: "0.4rem" }}>
                <Btn fill={low && !sponsored} disabled={busy || !hoax.wallet} onClick={fund}>
                  {busy ? "Sending…" : `Send ${AMOUNT} STT from my wallet`}
                </Btn>
                {hash && (
                  <a className="st-hash" href={txUrl(hash, chainId)} target="_blank" rel="noreferrer">
                    {short(hash)} ↗
                  </a>
                )}
              </div>
              {err && <p className="note bad">{err}</p>}
            </div>
          )}
        </div>
      </div>
      <StepNav back="/start/link" next="/start/policy" nextLabel="Policy" nextDisabled={!linked} />
    </article>
  );
}
