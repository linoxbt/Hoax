// The networks Hoax runs on, for the browser wallet: Hideki and Shannon. Each
// mirrors the markets SDK's definition plus the explorer, so wallets that do
// not know the chain yet can add it in one prompt.
import { defineChain } from "viem";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.hideki2.infra.testnet.somnia.network";

export const hideki = defineChain({
  id: 50383,
  name: "Somnia Hideki Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL], webSocket: ["wss://api.hideki2.infra.testnet.somnia.network/ws"] } },
  blockExplorers: { default: { name: "Somnia Explorer", url: "https://explorer.testnet.somnia.network/tokyo" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 1 } },
  testnet: true,
});

export const SHANNON_RPC_URL = process.env.NEXT_PUBLIC_SHANNON_RPC_URL || "https://dream-rpc.somnia.network";

export const shannon = defineChain({
  id: 50312,
  name: "Somnia Shannon Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [SHANNON_RPC_URL], webSocket: ["wss://dream-rpc.somnia.network/ws"] } },
  blockExplorers: { default: { name: "Shannon Explorer", url: "https://shannon-explorer.somnia.network" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 1 } },
  testnet: true,
});
