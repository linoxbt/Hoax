"use client";
// Step 4: optionally approve Hoax's builder fee on the pools you trade.
import { useState } from "react";
import { encodeFunctionData, parseAbi } from "viem";
import { StepNav } from "@/components/StepNav";
import { useStart } from "@/lib/startContext";

type Eth = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const APPROVE_ABI = parseAbi(["function approveBuilder(address builder, uint256 maxFeeBpsTimes1k)"]);

export default function FeeStep() {
  const { session, view, setErr } = useStart();
  const [tx, setTx] = useState<string | null>(null);
  const feeOn = Boolean(view?.builder.address) && (view?.builder.feeBpsTimes1k ?? 0) > 0;

  async function approve() {
    const provider = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!provider || !view?.builder.address || !session) return;
    setErr(null);
    try {
      const [from] = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (from?.toLowerCase() !== session.owner.toLowerCase()) {
        setErr("The connected browser wallet is not the wallet Hoax protects, so it cannot approve for it.");
        return;
      }
      const held = view.positions.map((p) => p.market);
      const pools = view.markets.filter((m) => (held.length ? held.includes(m.symbol) : m.symbol === "ETH-PERP")).map((m) => m.pool);
      for (const pool of pools) {
        const data = encodeFunctionData({
          abi: APPROVE_ABI,
          functionName: "approveBuilder",
          args: [view.builder.address as `0x${string}`, BigInt(view.builder.feeBpsTimes1k)],
        });
        setTx((await provider.request({ method: "eth_sendTransaction", params: [{ from, to: pool, data }] })) as string);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="grid g-aside" style={{ gap: 48 }}>
      <div>
        <h2>Builder fee</h2>
        <p className="copy soft" style={{ marginTop: 20 }}>
          Optional. Without an approval Hoax still protects you and charges nothing. Paper USDso accounts are never charged.
        </p>
      </div>
      <div>
        {!feeOn ? (
          <p className="copy">This Hoax deployment charges no builder fee. Nothing to do here.</p>
        ) : (
          <>
            <div className="num accent">
              {(view!.builder.feeBpsTimes1k / 1000).toString()}
              <small>bps per close</small>
            </div>
            <div className="row" style={{ marginTop: 24 }}>
              <button className="pill" onClick={approve}>
                Approve with connected wallet
              </button>
            </div>
            {tx && <p className="mono" style={{ marginTop: 12 }}>Sent {tx.slice(0, 18)}…</p>}
          </>
        )}
        <StepNav back="/start/gas" next="/start/policy" nextLabel="Policy" />
      </div>
    </div>
  );
}
