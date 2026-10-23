"use client";
// Step 3: the Hoax key needs STT to pay for its orders.
import { formatEther } from "viem";
import { StepNav } from "@/components/StepNav";
import { useStart } from "@/lib/startContext";

export default function GasStep() {
  const { view, linked } = useStart();
  const gas = view?.keyBalance ? BigInt(view.keyBalance) : null;
  const low = gas !== null && gas < 10n ** 16n;
  return (
    <div className="grid g-aside" style={{ gap: 48 }}>
      <div>
        <h2>Gas for Hoax&apos;s orders</h2>
        <p className="copy soft" style={{ marginTop: 20 }}>
          Each close costs about 0.003 STT. Sending gas when you link the bot covers many of them.
        </p>
      </div>
      <div>
        {!linked ? (
          <p className="copy soft">Link the key first.</p>
        ) : (
          <>
            <div className="num accent">
              {gas !== null ? Number(formatEther(gas)).toFixed(4) : "–"}
              <small>STT</small>
            </div>
            <p className="copy" style={{ marginTop: 20 }}>
              {gas === null
                ? "The balance could not be read right now."
                : low
                  ? "That is low. Top it up from dreamDEX: Bots tab, Top up."
                  : "That covers many closes."}
            </p>
          </>
        )}
        <StepNav back="/start/link" next="/start/fee" nextLabel="Builder fee" nextDisabled={!linked} />
      </div>
    </div>
  );
}
