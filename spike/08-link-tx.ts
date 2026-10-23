// Spike 8: the in-app link. Resolve a wallet's dreamDEX Safe, build the one
// transaction that grants a Hoax key trade-only rights on every perp pool, and
// prove the Safe accepts it with eth_estimateGas from the real owner. Nothing
// is sent.
//
//   WALLET=0x... npm run spike -- 08-link-tx
//
// Without WALLET it finds one: the sender of the newest Safe transaction that
// touched the OperatorPermissionsRegistry (dreamDEX's own "Link a bot").

import { DreamDexAccounts } from "@hoax/chain";
import { getAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Evidence, publicClient, venue } from "./lib.ts";

const ev = new Evidence("08-link-tx");
const accounts = new DreamDexAccounts();
const markets = await venue.listMarkets();
const pools = markets.map((m) => m.pool);
const registry = await accounts.operatorRegistry(pools[0]);
ev.log("registry", { registry, perpPools: pools.length });

async function recentLinker(): Promise<Address> {
  const head = await publicClient.getBlockNumber();
  for (let i = 0n; i < 200n; i++) {
    const to = head - i * 1000n;
    const logs = await publicClient.getLogs({ address: registry, fromBlock: to - 999n, toBlock: to });
    if (logs.length > 0) {
      const tx = await publicClient.getTransaction({ hash: logs[logs.length - 1].transactionHash! });
      return getAddress(tx.from);
    }
  }
  throw new Error("no recent registry activity found");
}

const wallet = process.env.WALLET ? getAddress(process.env.WALLET) : await recentLinker();
const found = await accounts.tradingAccounts(wallet);
const account = found.find((a) => a.deployed);
ev.log("accounts", { wallet, slots: found });
if (!account) {
  await ev.finish({ pass: null, summary: "wallet has no deployed dreamDEX account" });
  process.exit(0);
}
const controls = await accounts.controls(wallet, account.address);
const operator = privateKeyToAccount(generatePrivateKey()).address;
const tx = await accounts.buildLinkTx({ wallet, account: account.address, operator, pools, approved: true });
const gas = await accounts.estimateGas(tx);
// Negative control: the same bytes sent by anyone but the owner must revert (Safe GS025).
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const strangerGas = await accounts.estimateGas({ ...tx, from: stranger });
ev.log("negative-control", { stranger, refused: strangerGas === null });
const before = await accounts.linkStatus(account.address, operator, pools.slice(0, 3));
ev.log("link-tx", {
  account: account.address,
  controls,
  operator,
  calls: tx.calls.length,
  calldataBytes: (tx.data.length - 2) / 2,
  estimatedGasWithHeadroom: gas?.toString() ?? null,
  accepted: gas !== null,
  linkedBefore: before,
});
await ev.finish({
  pass: gas !== null && controls && strangerGas === null,
  summary:
    gas !== null
      ? `${account.address} (owned by ${wallet}) accepts the ${tx.calls.length}-call link batch from its owner; gas with headroom ${gas}`
      : "eth_estimateGas failed: the Safe would revert the link batch",
});
