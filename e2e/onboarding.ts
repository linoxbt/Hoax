// End-to-end: a trader goes from a fresh wallet to protected, through the real
// web app, against a local fork of Hideki with the real watcher running.
//
// The browser wallet is scripted: an EIP-1193 provider announced over EIP-6963
// whose signing happens here, in Node, with a throwaway key on the fork. Every
// contract call it makes is a real call the fork executes.
//
//   anvil --fork-url https://api.hideki2.infra.testnet.somnia.network --chain-id 50383 --port 8545
//   (watcher and web running against it: see e2e/README.md)
//   npx tsx e2e/onboarding.ts
//
// Screenshots land in E2E_OUT (default ./e2e/out).

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createAccountCall } from "@somnia-chain/accounts-sdk";
import { HIDEKI } from "@hoax/chain";
import { chromium, type Page } from "playwright-core";
import { createPublicClient, createWalletClient, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const RPC = process.env.FORK_RPC ?? "http://127.0.0.1:8545";
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const OUT = process.env.E2E_OUT ?? join(process.cwd(), "e2e", "out");
const BROWSER = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
mkdirSync(OUT, { recursive: true });

const fork = createPublicClient({ chain: HIDEKI.chain, transport: http(RPC) });
const owner = privateKeyToAccount(generatePrivateKey());
const signer = createWalletClient({ account: owner, chain: HIDEKI.chain, transport: http(RPC) });

async function setup() {
  await fork.request({ method: "anvil_setBalance" as never, params: [owner.address, `0x${parseEther("5").toString(16)}`] as never });
  const c = createAccountCall(HIDEKI.chain.id, owner.address, 0n);
  const h = await signer.sendTransaction({ to: c.to, data: c.data, value: 0n, gas: c.gas });
  await fork.waitForTransactionReceipt({ hash: h });
  console.log(`wallet ${owner.address} with a fresh dreamDEX Safe`);
}

/** Like a real extension, the site sees no accounts until it asks and the user approves. */
let authorized = false;

/** The scripted wallet: what a browser extension would do, done here. */
async function walletRequest(method: string, params: unknown[]): Promise<unknown> {
  if (process.env.E2E_DEBUG) console.log("  wallet:", method);
  switch (method) {
    case "eth_requestAccounts":
      authorized = true;
      return [owner.address];
    case "eth_accounts":
      return authorized ? [owner.address] : [];
    case "eth_chainId":
      return `0x${HIDEKI.chain.id.toString(16)}`;
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
      return null;
    case "wallet_requestPermissions":
    case "wallet_getPermissions":
      return [{ parentCapability: "eth_accounts" }];
    case "personal_sign": {
      const [data] = params as [Hex, string];
      return owner.signMessage({ message: { raw: data } });
    }
    case "eth_sendTransaction": {
      const [tx] = params as [{ to: Hex; data?: Hex; value?: Hex; gas?: Hex }];
      return signer.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : 0n,
        gas: tx.gas ? BigInt(tx.gas) : 60_000_000n,
      });
    }
    default:
      return fork.request({ method: method as never, params: params as never });
  }
}

const PROVIDER = `
(() => {
  const listeners = {};
  const provider = {
    isMetaMask: false,
    request: async ({ method, params }) => {
      const r = await window.__wallet(method, JSON.stringify(params ?? []));
      const out = JSON.parse(r);
      if (out.error) { const e = new Error(out.error); e.code = 4001; throw e; }
      return out.result;
    },
    on: (ev, fn) => { (listeners[ev] ??= []).push(fn); },
    removeListener: (ev, fn) => { listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn); },
  };
  window.ethereum = provider;
  const info = { uuid: "7d1c1f0e-hoax-e2e", name: "E2E Wallet", rdns: "dev.hoax.e2e",
    icon: "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#14123a"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#fff" font-family="monospace">E2</text></svg>') };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;

let shot = 0;
async function snap(page: Page, name: string) {
  const file = join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("  screenshot", file);
}

async function main() {
  await setup();
  const browser = await chromium.launch({ executablePath: BROWSER });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.exposeFunction("__wallet", async (method: string, params: string) => {
    try {
      const result = await walletRequest(method, JSON.parse(params));
      return JSON.stringify({ result }, (_k, v) => (typeof v === "bigint" ? `0x${v.toString(16)}` : v));
    } catch (e) {
      return JSON.stringify({ error: (e as Error).message.split("\n")[0] });
    }
  });
  await page.addInitScript(PROVIDER);
  page.on("pageerror", (e) => console.log("  page error:", e.message));
  if (process.env.E2E_DEBUG) page.on("console", (m) => console.log("  console:", m.text().slice(0, 240)));

  console.log("1. connect and verify");
  await page.goto(`${WEB}/start`);
  await page.waitForTimeout(1500);
  if (process.env.E2E_DEBUG) console.log("  buttons:", await page.locator("button").evaluateAll((bs) => bs.map((b) => `${b.textContent}${(b as HTMLButtonElement).disabled ? "(disabled)" : ""}`)));
  await page.locator(".checklist").getByRole("button", { name: "Connect wallet" }).click();
  await page.locator(".modal").getByRole("button", { name: /E2E Wallet/ }).click();
  await page.locator(".modal").getByRole("button", { name: "Verify wallet", exact: true }).click();
  await page.getByText("Connected and verified.").waitFor({ timeout: 20_000 });
  await snap(page, "verified");
  await page.waitForSelector(".modal", { state: "detached", timeout: 10_000 });
  await page.locator(".checklist > div.ok").nth(3).waitFor({ timeout: 30_000 });
  await snap(page, "account-found");

  console.log("2. register, receive the key, link in one transaction");
  await page.getByRole("link", { name: /Link Hoax/ }).click();
  await page.getByRole("button", { name: /Link Hoax · one transaction/ }).waitFor({ timeout: 60_000 });
  await snap(page, "key-issued");
  await page.getByRole("button", { name: /Link Hoax · one transaction/ }).click();
  await page.getByText(/linked on 21 markets/).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);
  await snap(page, "linked");

  console.log("3. gas");
  await page.getByRole("link", { name: /Gas/ }).last().click();
  await page.getByText(/STT on/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(4000);
  await snap(page, "gas");

  console.log("4. policy, then the app");
  await page.getByRole("link", { name: /Policy/ }).last().click();
  await page.getByRole("button", { name: "Turn on Hoax" }).click();
  await page.waitForURL(`${WEB}/app`, { timeout: 20_000 });
  await page.waitForTimeout(3000);
  await snap(page, "app");
  await page.goto(`${WEB}/app/settings`);
  await page.getByText(/21 \/ 21/).waitFor({ timeout: 20_000 });
  await snap(page, "settings");

  console.log("5. revoke from settings");
  await page.getByRole("button", { name: "Revoke access" }).click();
  await page.getByText("Revoked.").waitFor({ timeout: 60_000 });
  await page.getByText(/0 \/ 21/).waitFor({ timeout: 20_000 });
  await snap(page, "revoked");

  await browser.close();
  console.log("PASS: fresh wallet → verified → key issued → linked on 21 markets → engine active → policy on → revoked");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
