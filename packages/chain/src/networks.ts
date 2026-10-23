// The Somnia networks dreamDEX perps run on. The dreamDEX testnet app trades on
// both: Shannon (50312), where most of its testnet traders are, and Hideki
// (50383), the low-latency Tokyo network. Each has its own margin bank, perp
// pools, markets indexer and RPC; the account factory and the accounts indexer
// are shared.

import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet, somniaShannon } from "@somnia-chain/markets-sdk/chains";

export const HIDEKI = {
  id: 50383,
  key: "hideki",
  name: "Somnia Hideki",
  chain: hidekiTestnet,
  rpcUrl: "https://api.hideki2.infra.testnet.somnia.network",
  wsUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  explorer: "https://explorer.testnet.somnia.network/tokyo",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
} as const;

export const SHANNON = {
  id: 50312,
  key: "shannon",
  name: "Somnia Shannon",
  chain: somniaShannon,
  rpcUrl: "https://dream-rpc.somnia.network",
  wsUrl: "wss://dream-rpc.somnia.network/ws",
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  explorer: "https://shannon-explorer.somnia.network",
  addresses: SOMNIA_TESTNET_ADDRESSES,
} as const;

export type Network = typeof HIDEKI | typeof SHANNON;
export type NetworkId = Network["id"];

/** Every network Hoax reads, Shannon first: it is where the dreamDEX testnet app sends new traders. */
export const NETWORKS: readonly Network[] = [SHANNON, HIDEKI];

export function isNetworkId(id: number): id is NetworkId {
  return NETWORKS.some((n) => n.id === id);
}

export function networkOf(id: number): Network {
  const n = NETWORKS.find((x) => x.id === id);
  if (!n) throw new Error(`unsupported network ${id}`);
  return n;
}
