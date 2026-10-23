// Spike 7 (probe): can an on-chain reactivity subscription be created and
// funded on Hideki? This read-only probe checks the reactivity precompile and
// the node's subscription reads; creating one needs a funded owner key and is
// only attempted by hand.
//   [OWNER_ADDRESS=0x…] npm run spike -- 07-subscription
import { createNative } from "@somnia-chain/markets-sdk/native";
import { getAddress } from "viem";
import { Evidence, publicClient } from "./lib.ts";

const ev = new Evidence("07-subscription");
const precompile = "0x0000000000000000000000000000000000000100";
const code = await publicClient.getCode({ address: precompile });
ev.log("precompile 0x0100", { codeBytes: code ? (code.length - 2) / 2 : 0 });
const native = createNative(publicClient as never);
let readsWork = false;
try {
  const owner = getAddress(process.env.OWNER_ADDRESS ?? "0x0000000000000000000000000000000000000001");
  const ids = await native.listReactivitySubscriptionIds(owner);
  readsWork = true;
  ev.log("subscriptions", { owner, ids });
} catch (err) {
  ev.log("subscription read failed", { error: String(err).slice(0, 200) });
}
await ev.finish({
  pass: null,
  summary: `subscription reads ${readsWork ? "answer" : "do not answer"} on Hideki; creating and funding one needs a funded owner key, so v1 uses the off-chain watcher`,
  readsWork,
});
process.exit(0);
