// Sample data for running the web app without a watcher or database
// (HOAX_DEMO=1). Every page that shows it says so.
import { DEFAULT_POLICY, receiptHash, type Receipt } from "@hoax/core";
import type { Store } from "@hoax/db";
import { createHash } from "node:crypto";

export const DEMO_OWNER = "0x00000000000000000000000000000000000d3e00";
export const DEMO_TOKEN = "demo";

const E18 = 10n ** 18n;

export async function seedDemo(store: Store): Promise<void> {
  const id = "00000000-0000-4000-8000-000000000001";
  await store.createAccount({ id, owner: DEMO_OWNER, manageTokenHash: createHash("sha256").update(DEMO_TOKEN).digest("hex") });
  await store.setHoaxKey(id, "0x00000000000000000000000000000000000b0a50");
  await store.setStatus(id, "active");
  await store.upsertPolicy(id, "ETH-PERP", DEFAULT_POLICY);
  await store.insertHealthTicks([
    {
      accountId: id,
      market: "ETH-PERP",
      block: 30_960_000n,
      health: 1.71,
      equity: 66n * E18,
      mmReq: 386n * 10n ** 17n,
      mark: 2205n * E18,
      markOk: true,
      size: 7n * 10n ** 17n,
      liqPrice: 2152n * E18,
    },
  ]);

  const mk = (n: number, outcome: Receipt["outcome"], extra: Partial<Receipt>): Receipt => ({
    version: 1,
    account: DEMO_OWNER as `0x${string}`,
    hoaxKey: "0x00000000000000000000000000000000000b0a50",
    market: "ETH-PERP",
    pool: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    side: "long",
    outcome,
    reason: null,
    blockNumber: String(30_950_000 + n),
    txHash: null,
    sizeBefore: String(E18),
    sizeRequested: String(3n * 10n ** 17n),
    sizeFilled: String(3n * 10n ** 17n),
    sizeAfter: String(7n * 10n ** 17n),
    avgFillPrice: String(2317n * E18),
    markAtClose: String(2318n * E18),
    closeCost: String(3n * 10n ** 17n),
    estCloseCost: String(3n * 10n ** 17n),
    estLiquidationCost: String(34n * E18),
    healthBefore: 1.17,
    healthAfter: 1.61,
    liqPriceBefore: String(2308n * E18),
    liqPriceAfter: String(2253n * E18),
    builderFeeBpsTimes1k: 0,
    createdAt: new Date(Date.now() - n * 3_600_000).toISOString(),
    ...extra,
  });

  const rows: Array<{ outcome: Receipt["outcome"]; n: number; preserved?: bigint; reason?: string }> = [
    { outcome: "saved", n: 5, preserved: 24n * E18 },
    { outcome: "not-needed", n: 30 },
    { outcome: "skipped", n: 2, reason: "no liquidity within max slippage" },
  ];
  let i = 0;
  for (const r of rows) {
    const receipt = mk(r.n, r.outcome, { reason: r.reason ?? null });
    const actionId = `00000000-0000-4000-8000-00000000010${i++}`;
    await store.insertAction({
      id: actionId,
      accountId: id,
      owner: DEMO_OWNER,
      market: "ETH-PERP",
      pool: receipt.pool,
      side: "long",
      block: BigInt(receipt.blockNumber!),
      txHash: r.outcome === "skipped" ? null : `0x${"de".repeat(32)}`,
      sizeBefore: E18,
      sizeRequested: r.outcome === "skipped" ? 0n : 3n * 10n ** 17n,
      sizeFilled: r.outcome === "skipped" ? 0n : 3n * 10n ** 17n,
      sizeAfter: 7n * 10n ** 17n,
      avgPrice: 2317n * E18,
      mark: 2318n * E18,
      cost: r.outcome === "skipped" ? null : 3n * 10n ** 17n,
      estCloseCost: 3n * 10n ** 17n,
      estLiqCost: 34n * E18,
      forcedSlippage: 11n * E18,
      equityBefore: 68n * E18,
      mmReqBefore: 58n * E18,
      healthBefore: 1.17,
      healthAfter: r.outcome === "skipped" ? null : 1.61,
      liqPriceBefore: 2308n * E18,
      liqPriceAfter: 2253n * E18,
      builderFee1k: 0n,
      outcome: r.outcome,
      reason: r.reason ?? null,
      receipt,
      receiptHash: receiptHash(receipt),
      signature: null,
    });
    if (r.preserved) {
      await store.upsertCounterfactual({
        actionId,
        originalLiqPrice: 2308n * E18,
        reachedAtBlock: 30_955_000n,
        equityAtReach: 55n * E18,
        equityIfLiquidated: 31n * E18,
        preserved: r.preserved,
        finalOutcome: "saved",
        resolvedAt: new Date(),
      });
    }
  }
}
