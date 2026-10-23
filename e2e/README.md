# End to end

`onboarding.ts` takes a fresh wallet from nothing to protected through the real web app, with the real watcher, against a local fork of Hideki. The browser wallet is scripted: an EIP-1193 provider announced over EIP-6963 that signs in Node with a throwaway key, so every contract call is one the fork actually executes.

```sh
# 1. a fork of Hideki (Anvil ships on npm as @foundry-rs/anvil)
anvil --fork-url https://api.hideki2.infra.testnet.somnia.network --chain-id 50383 --port 8545

# 2. Postgres, then the watcher on the fork (Anvil's first account funds the gas drips)
DATABASE_URL=postgres://hoax:hoax@127.0.0.1:5432/hoax_e2e HOAX_KEYSTORE_SECRET=<32+ chars> \
RPC_URL=http://127.0.0.1:8545 WS_URL=ws://127.0.0.1:8545 PORT=8081 \
GAS_WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
npx tsx services/watcher/src/main.ts

# 3. the web app, built against the fork (the browser's RPC is fixed at build time)
cd apps/web && NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 npm run build
DATABASE_URL=… RPC_URL=http://127.0.0.1:8545 HOAX_SESSION_SECRET=<32+ chars> npx next start -p 3100

# 4. the run
npx tsx e2e/onboarding.ts
```

If the web app was built with `NEXT_PUBLIC_REOWN_PROJECT_ID`, run with `E2E_REOWN=1` so the wallet is picked in the Reown modal.

It passes when the wallet is verified, the watcher issues its key, one transaction links all 21 perp markets, the watcher activates the account and drips gas, the policy is saved, and the revoke transaction leaves 0 of 21 linked. Screenshots go to `e2e/out/`.
