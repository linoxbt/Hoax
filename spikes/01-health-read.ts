// Spike 1: can Hoax read what it needs to decide on a save?
// Lists the perp markets on Somnia Tokyo testnet (Hideki), checks each mark feed,
// and, if ACCOUNT is set, reads that account's cross-margin health and liquidation price.
// Read-only: needs no key and signs nothing.
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES, type PerpMarket } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { formatUnits, type Address } from "viem";

const INDEXER_URL = process.env.INDEXER_URL ?? "https://hideki-dev.smk.somnia.host/v1/graphql";
const account = process.env.ACCOUNT as Address | undefined;

const exchange = new SomniaMarkets({
  chain: hidekiTestnet,
  wsRpcUrl: hidekiTestnet.rpcUrls.default.webSocket[0],
  indexerUrl: INDEXER_URL,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});

try {
  const client = exchange.client;
  const perps = (await client.listMarkets({ marketType: "PERP" })) as PerpMarket[];
  console.log(`perp markets: ${perps.length}`);

  for (const m of perps) {
    const feed = await client.getPerpFeedStatus(m.poolAddress);
    const live = feed.markPriceOk && feed.markPrice > 0n;
    console.log(
      `${m.baseSymbol}/${m.quoteSymbol} pool=${m.poolAddress} marginBank=${m.marginBank}` +
        ` mark=${feed.markPrice} live=${live} openInterest=${feed.openInterest}` +
        ` minQty=${m.minQuantity} lot=${m.lotSize}`,
    );
  }

  if (account && perps.length > 0) {
    const marginBank = perps[0].marginBank;
    const h = await client.getAccountHealth(marginBank, account);
    // Hoax's health ratio: equity over maintenance requirement. Liquidation starts at 1.0.
    const ratio = h.mmReq > 0n ? Number((h.equity * 10_000n) / h.mmReq) / 10_000 : Infinity;
    console.log(
      `account ${account}: equity=${formatUnits(h.equity, 18)} mmReq=${formatUnits(h.mmReq, 18)}` +
        ` cmReq=${formatUnits(h.cmReq, 18)} status=${h.marginStatus} health=${ratio}`,
    );
    for (const m of perps) {
      const liq = await client.getLiquidationPrice({ marginBank, pool: m.poolAddress, account });
      console.log(`  ${m.baseSymbol}: liquidation price=${liq ?? "flat"}`);
    }
  }
} finally {
  await exchange.close();
}
