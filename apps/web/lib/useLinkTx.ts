"use client";
// Send the link (or revoke) transaction: the API builds it for this wallet's
// Safe, the wallet sends it, and we wait for the block.

import { useCallback, useState } from "react";
import { sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import { api } from "./session";
import type { LinkTxJson } from "./types";
import { useHoax, wagmiConfig } from "./wallet";

export type LinkPhase = "idle" | "building" | "confirm" | "mining" | "done" | "error";

export function useLinkTx() {
  const hoax = useHoax();
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<LinkTxJson | null>(null);

  const send = useCallback(
    async (opts: { approved: boolean; builderFee?: boolean }) => {
      const session = hoax.session;
      if (!session || !hoax.wallet) return false;
      setErr(null);
      setHash(null);
      try {
        await hoax.ensureChain(session.chainId);
        if (!hoax.signedIn && !(await hoax.signIn())) throw new Error("Verify your wallet first.");
        setPhase("building");
        const token = hoax.session?.token || readToken(hoax.wallet);
        const tx = await api<LinkTxJson>("/api/link", {
          method: "POST",
          token,
          body: JSON.stringify({ owner: session.owner, chain: session.chainId, approved: opts.approved, builderFee: opts.builderFee }),
        });
        setPlan(tx);
        setPhase("confirm");
        const h = await sendTransaction(wagmiConfig(), {
          chainId: session.chainId,
          account: hoax.wallet,
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value),
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
        setHash(h);
        setPhase("mining");
        const r = await waitForTransactionReceipt(wagmiConfig(), { hash: h, chainId: session.chainId });
        if (r.status !== "success") throw new Error("The transaction reverted. Nothing changed.");
        setPhase("done");
        return true;
      } catch (e) {
        setErr(friendly(e));
        setPhase("error");
        return false;
      }
    },
    [hoax],
  );

  return { send, phase, hash, err, plan, reset: () => setPhase("idle") };
}

function readToken(wallet: string): string {
  try {
    const raw = localStorage.getItem(`hoax.auth.${wallet.toLowerCase()}`);
    return raw ? (JSON.parse(raw) as { token: string }).token : "";
  } catch {
    return "";
  }
}

export function friendly(e: unknown): string {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e);
  if (/reject|denied|cancel/i.test(m)) return "Cancelled in the wallet. Nothing was sent.";
  if (/insufficient funds/i.test(m)) return "Not enough STT in this wallet to pay the gas.";
  return m.split("\n")[0].slice(0, 220);
}
