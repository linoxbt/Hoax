"use client";
// The browser wallet and everything Hoax derives from it: which dreamDEX
// account (Safe) the wallet trades from, and the signed-in session that lets it
// manage protection. One provider at the root; every page reads `useHoax()`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WagmiProvider, createConfig, http, injected, useAccount as useWagmiAccount, useDisconnect } from "wagmi";
import { signMessage, switchChain } from "wagmi/actions";
import type { Address } from "viem";
import { ConnectModal } from "@/components/ConnectModal";
import { hideki, RPC_URL } from "./chain";
import { api, type Session } from "./session";
import type { EngineJson, WalletJson } from "./types";

export const wagmiConfig = createConfig({
  chains: [hideki],
  // EIP-6963 discovery lists every installed wallet by name and icon; `injected`
  // covers in-app browsers that only expose window.ethereum.
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ shimDisconnect: true })],
  transports: { [hideki.id]: http(RPC_URL) },
  ssr: true,
});

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

interface Auth {
  wallet: string;
  token: string;
  expiresAt: string;
}

export interface HoaxState {
  /** The connected wallet key, if any. */
  wallet: Address | undefined;
  connecting: boolean;
  onHideki: boolean;
  /** The wallet's dreamDEX accounts; null until read. */
  walletInfo: WalletJson | null;
  walletErr: string | null;
  /** The dreamDEX account Hoax protects for this wallet. */
  account: string | null;
  signedIn: boolean;
  /**
   * What the app pages run on: the protected account plus the session token.
   * undefined while the wallet reconnects or the account is being read.
   */
  session: Session | null | undefined;
  engine: EngineJson | null;
  openConnect: () => void;
  signIn: () => Promise<boolean>;
  ensureChain: () => Promise<void>;
  disconnect: () => void;
  refreshWallet: () => Promise<void>;
  /** Explore the app on the sample account (demo deployments only). */
  useSample: () => void;
  sample: boolean;
}

const HoaxContext = createContext<HoaxState | null>(null);

const authKey = (wallet: string) => `hoax.auth.${wallet.toLowerCase()}`;
const SAMPLE_KEY = "hoax.sample";
export const SAMPLE_SESSION: Session = { owner: "0x00000000000000000000000000000000000d3e00", accountId: "", token: "demo" };

function readAuth(wallet: string): Auth | null {
  try {
    const raw = localStorage.getItem(authKey(wallet));
    if (!raw) return null;
    const a = JSON.parse(raw) as Auth;
    return Date.parse(a.expiresAt) > Date.now() + 60_000 ? a : null;
  } catch {
    return null;
  }
}

function writeAuth(a: Auth | null, wallet: string) {
  try {
    if (a) localStorage.setItem(authKey(wallet), JSON.stringify(a));
    else localStorage.removeItem(authKey(wallet));
  } catch {
    // private mode: the session lasts as long as the page
  }
}

function HoaxStateProvider({ children }: { children: React.ReactNode }) {
  const { address, chainId, status } = useWagmiAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const [modal, setModal] = useState(false);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletJson | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineJson | null>(null);
  const [sample, setSample] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const signing = useRef(false);

  useEffect(() => {
    setHydrated(true);
    try {
      setSample(localStorage.getItem(SAMPLE_KEY) === "1");
    } catch {}
  }, []);

  // Restore a stored sign-in for whichever wallet is connected.
  useEffect(() => {
    setAuth(address ? readAuth(address) : null);
    setWalletInfo(null);
    setWalletErr(null);
    if (address) {
      setSample(false);
      try {
        localStorage.removeItem(SAMPLE_KEY);
      } catch {}
    }
  }, [address]);

  const refreshWallet = useCallback(async () => {
    if (!address) return;
    try {
      setWalletInfo(await api<WalletJson>(`/api/wallet/${address}`));
      setWalletErr(null);
    } catch (e) {
      setWalletErr((e as Error).message);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    void refreshWallet();
    const t = setInterval(refreshWallet, 15_000);
    return () => clearInterval(t);
  }, [address, refreshWallet]);

  useEffect(() => {
    const load = () => api<EngineJson>("/api/engine").then(setEngine, () => {});
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const ensureChain = useCallback(async () => {
    if (chainId !== hideki.id) await switchChain(wagmiConfig, { chainId: hideki.id });
  }, [chainId]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address || signing.current) return false;
    signing.current = true;
    try {
      const { message } = await api<{ message: string }>("/api/auth/challenge", { method: "POST", body: JSON.stringify({ address }) });
      const signature = await signMessage(wagmiConfig, { account: address, message });
      const r = await api<{ wallet: string; token: string; expiresAt: string }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      });
      const a = { wallet: r.wallet, token: r.token, expiresAt: r.expiresAt };
      writeAuth(a, address);
      setAuth(a);
      return true;
    } finally {
      signing.current = false;
    }
  }, [address]);

  const disconnect = useCallback(() => {
    if (address) writeAuth(null, address);
    setAuth(null);
    setSample(false);
    try {
      localStorage.removeItem(SAMPLE_KEY);
    } catch {}
    wagmiDisconnect();
  }, [address, wagmiDisconnect]);

  const useSample = useCallback(() => {
    try {
      localStorage.setItem(SAMPLE_KEY, "1");
    } catch {}
    setSample(true);
    setModal(false);
  }, []);

  const account = walletInfo?.primary ?? null;
  const signedIn = Boolean(auth && address && auth.wallet.toLowerCase() === address.toLowerCase());

  const session: Session | null | undefined = useMemo(() => {
    if (!hydrated) return undefined;
    if (sample && !address) return SAMPLE_SESSION;
    if (status === "reconnecting" || status === "connecting") return undefined;
    if (!address) return null;
    if (!walletInfo) return walletErr ? null : undefined;
    if (!account) return null;
    return { owner: account.toLowerCase(), accountId: "", token: signedIn ? auth!.token : "" };
  }, [hydrated, sample, address, status, walletInfo, walletErr, account, signedIn, auth]);

  const value: HoaxState = {
    wallet: address,
    connecting: status === "connecting" || status === "reconnecting",
    onHideki: chainId === hideki.id,
    walletInfo,
    walletErr,
    account,
    signedIn,
    session,
    engine,
    openConnect: () => setModal(true),
    signIn,
    ensureChain,
    disconnect,
    refreshWallet,
    useSample,
    sample,
  };

  return (
    <HoaxContext.Provider value={value}>
      {children}
      <ConnectModal open={modal} onClose={() => setModal(false)} />
    </HoaxContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <HoaxStateProvider>{children}</HoaxStateProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function useHoax(): HoaxState {
  const s = useContext(HoaxContext);
  if (!s) throw new Error("useHoax outside <Providers>");
  return s;
}
