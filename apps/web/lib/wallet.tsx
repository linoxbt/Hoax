"use client";
// The browser wallet and everything Hoax derives from it: which dreamDEX
// account (Safe) the wallet trades from, and the signed-in session that lets it
// manage protection. One provider at the root; every page reads `useHoax()`.

import type { AppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WagmiProvider, createConfig, http, injected, useAccount as useWagmiAccount, useDisconnect, type Config } from "wagmi";
import { reconnect, signMessage, switchChain } from "wagmi/actions";
import type { Address } from "viem";
import { ConnectModal } from "@/components/ConnectModal";
import { hideki, RPC_URL, shannon, SHANNON_RPC_URL } from "./chain";
import { api, type Session } from "./session";
import type { EngineJson, WalletJson } from "./types";

/** Reown Cloud project id. Without one, Hoax falls back to its own picker of installed wallets. */
const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

/**
 * The light config every page starts on: wallets installed in the browser,
 * found by EIP-6963, plus `injected` for in-app browsers that only expose
 * window.ethereum. The Reown config replaces it when someone connects.
 */
const baseConfig = createConfig({
  chains: [hideki, shannon],
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ shimDisconnect: true })],
  transports: { [hideki.id]: http(RPC_URL), [shannon.id]: http(SHANNON_RPC_URL) },
  ssr: true,
});

let activeConfig: Config = baseConfig;
/** The wagmi config in use right now, for actions called outside React. */
export const wagmiConfig = (): Config => activeConfig;

// Connectors only the Reown config has; if the last session used one, restore it through Reown.
const REOWN_CONNECTORS = ["walletConnect", "baseAccount", "coinbaseWalletSDK", "metaMaskSDK"];
function lastUsedReown(): boolean {
  if (!REOWN_PROJECT_ID || typeof window === "undefined") return false;
  try {
    const id = JSON.parse(localStorage.getItem("wagmi.recentConnectorId") ?? "null");
    return REOWN_CONNECTORS.includes(id);
  } catch {
    return false;
  }
}
const restoreViaReown = lastUsedReown();

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
  /** On a network dreamDEX runs on (Shannon or Hideki): enough to verify and to read. */
  onSupported: boolean;
  /** The wallet's dreamDEX accounts; null until read. */
  walletInfo: WalletJson | null;
  walletErr: string | null;
  /** The dreamDEX account the app is showing for this wallet. */
  account: string | null;
  /** The network that account lives on. */
  accountChain: number | null;
  /** Show another of the wallet's accounts (it may own one per network). */
  selectAccount: (chainId: number, address: string) => void;
  signedIn: boolean;
  /**
   * What the app pages run on: the protected account plus the session token.
   * undefined while the wallet reconnects or the account is being read.
   */
  session: Session | null | undefined;
  engine: EngineJson | null;
  openConnect: () => void;
  /** True when wallet selection goes through the Reown modal. */
  hasReown: boolean;
  signIn: () => Promise<boolean>;
  /** Switch the wallet to a network (the account's, usually); Hideki when none is given. */
  ensureChain: (chainId?: number) => Promise<void>;
  disconnect: () => void;
  refreshWallet: () => Promise<void>;
  /** Explore the app on the sample account (demo deployments only). */
  useSample: () => void;
  sample: boolean;
}

const HoaxContext = createContext<HoaxState | null>(null);

const authKey = (wallet: string) => `hoax.auth.${wallet.toLowerCase()}`;
const SAMPLE_KEY = "hoax.sample";
export const SAMPLE_SESSION: Session = { owner: "0x00000000000000000000000000000000000d3e00", accountId: "", token: "demo", chainId: 50383 };
const pickKey = (wallet: string) => `hoax.pick.${wallet.toLowerCase()}`;

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

function HoaxStateProvider({ children, reown }: { children: React.ReactNode; reown: () => Promise<AppKit | null> }) {
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
  // Set when Connect sends the user to the Reown modal, so the verify step opens once a wallet arrives.
  const verifyNext = useRef(false);

  useEffect(() => {
    if (address && verifyNext.current) {
      verifyNext.current = false;
      setModal(true);
    }
  }, [address]);

  const [opening, setOpening] = useState(false);
  const openConnect = useCallback(() => {
    if (address || !REOWN_PROJECT_ID) return setModal(true);
    setOpening(true);
    reown()
      .then((kit) => {
        if (!kit) return setModal(true);
        verifyNext.current = true;
        return kit.open({ view: "Connect" });
      })
      .catch(() => setModal(true))
      .finally(() => setOpening(false));
  }, [address, reown]);

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

  const ensureChain = useCallback(
    async (target: number = hideki.id) => {
      if (chainId !== target) await switchChain(wagmiConfig(), { chainId: target });
    },
    [chainId],
  );

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address || signing.current) return false;
    signing.current = true;
    try {
      // The wallet's own network, when Hoax serves it: a smart wallet's signature is checked there.
      const chain = chainId === hideki.id || chainId === shannon.id ? chainId : hideki.id;
      const { message } = await api<{ message: string }>("/api/auth/challenge", { method: "POST", body: JSON.stringify({ address, chain }) });
      const signature = await signMessage(wagmiConfig(), { account: address, message });
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
  }, [address, chainId]);

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

  // The account on screen: the one the user picked if the wallet still has it, else the primary.
  const [picked, setPicked] = useState<{ chainId: number; address: string } | null>(null);
  useEffect(() => {
    if (!address) return setPicked(null);
    try {
      setPicked(JSON.parse(localStorage.getItem(pickKey(address)) ?? "null"));
    } catch {
      setPicked(null);
    }
  }, [address]);
  const selectAccount = useCallback(
    (chainId: number, addr: string) => {
      const p = { chainId, address: addr };
      setPicked(p);
      try {
        if (address) localStorage.setItem(pickKey(address), JSON.stringify(p));
      } catch {}
    },
    [address],
  );
  const shown =
    (picked && walletInfo?.accounts.find((a) => a.chainId === picked.chainId && a.address.toLowerCase() === picked.address.toLowerCase())) ||
    walletInfo?.accounts[0] ||
    null;
  const account = shown?.address ?? null;
  const accountChain = shown?.chainId ?? null;
  const signedIn = Boolean(auth && address && auth.wallet.toLowerCase() === address.toLowerCase());

  const session: Session | null | undefined = useMemo(() => {
    if (!hydrated) return undefined;
    if (sample && !address) return SAMPLE_SESSION;
    if (status === "reconnecting" || status === "connecting") return undefined;
    if (!address) return null;
    if (!walletInfo) return walletErr ? null : undefined;
    if (!account || !accountChain) return null;
    return { owner: account.toLowerCase(), accountId: "", token: signedIn ? auth!.token : "", chainId: accountChain };
  }, [hydrated, sample, address, status, walletInfo, walletErr, account, accountChain, signedIn, auth]);

  const value: HoaxState = {
    wallet: address,
    connecting: opening || status === "connecting" || status === "reconnecting",
    onHideki: chainId === hideki.id,
    onSupported: chainId === hideki.id || chainId === shannon.id,
    walletInfo,
    walletErr,
    account,
    accountChain,
    selectAccount,
    signedIn,
    session,
    engine,
    openConnect,
    hasReown: REOWN_PROJECT_ID !== "",
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
  const [config, setConfig] = useState<Config>(baseConfig);
  const loading = useRef<Promise<AppKit | null> | null>(null);

  // Load Reown once, move wagmi onto its config, and restore any session it holds.
  const reown = useCallback(() => {
    if (!REOWN_PROJECT_ID) return Promise.resolve(null);
    loading.current ??= import("./reown").then(async ({ loadReown }) => {
      const { config: next, appKit } = loadReown(REOWN_PROJECT_ID);
      await reconnect(next).catch(() => []);
      activeConfig = next;
      setConfig(next);
      return appKit;
    });
    return loading.current;
  }, []);

  useEffect(() => {
    if (restoreViaReown) {
      void reown();
      return;
    }
    // Otherwise fetch the module while the browser is idle, so Connect opens at once.
    if (!REOWN_PROJECT_ID) return;
    const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const prefetch = () => void import("./reown");
    const id = idle ? idle(prefetch, { timeout: 6000 }) : window.setTimeout(prefetch, 3000);
    return () => (idle ? (window as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(id) : clearTimeout(id));
  }, [reown]);

  return (
    <WagmiProvider config={config} reconnectOnMount={!restoreViaReown}>
      <QueryClientProvider client={queryClient}>
        <HoaxStateProvider reown={reown}>{children}</HoaxStateProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function useHoax(): HoaxState {
  const s = useContext(HoaxContext);
  if (!s) throw new Error("useHoax outside <Providers>");
  return s;
}
