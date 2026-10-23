"use client";
// Reown AppKit: installed wallets, WalletConnect QR for phones and 500+ more,
// themed to the drawing system. It weighs about 2 MB, so lib/wallet.tsx imports
// this module only when someone connects, or when a WalletConnect session
// needs restoring.

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";
import { createAppKit, type AppKit } from "@reown/appkit/react";
import { http, type Config } from "wagmi";
import { hideki, RPC_URL, shannon, SHANNON_RPC_URL } from "./chain";

const hidekiNetwork = defineChain({ ...hideki, chainNamespace: "eip155", caipNetworkId: "eip155:50383" });
const shannonNetwork = defineChain({ ...shannon, chainNamespace: "eip155", caipNetworkId: "eip155:50312" });

let made: { config: Config; appKit: AppKit } | null = null;

export function loadReown(projectId: string): { config: Config; appKit: AppKit } {
  if (made) return made;
  // Built in the browser after the page has mounted, so not an SSR config: with
  // ssr on, wagmi would wait for a mount-time hydrate that never comes and skip
  // the wallets the browser has already announced.
  const adapter = new WagmiAdapter({
    projectId,
    networks: [hidekiNetwork, shannonNetwork],
    transports: { [hideki.id]: http(RPC_URL), [shannon.id]: http(SHANNON_RPC_URL) },
    ssr: false,
  });
  const appKit = createAppKit({
    adapters: [adapter],
    projectId,
    networks: [hidekiNetwork, shannonNetwork],
    defaultNetwork: hidekiNetwork,
    metadata: {
      name: "Hoax",
      description: "Liquidation protection for dreamDEX perps",
      url: window.location.origin,
      icons: [`${window.location.origin}/apple-icon.png`],
    },
    features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, send: false, history: false },
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#fa3600",
      "--w3m-color-mix": "#f5f5ef",
      "--w3m-color-mix-strength": 12,
      "--w3m-border-radius-master": "0px",
      "--w3m-font-family": "Geist, 'Helvetica Neue', Arial, sans-serif",
      "--w3m-z-index": 1000,
    },
  });
  made = { config: adapter.wagmiConfig, appKit };
  return made;
}
