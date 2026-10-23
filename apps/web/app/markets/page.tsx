import { PageHead } from "@/components/Kicker";
import { MarketTable } from "@/components/LiveMarkets";

export const metadata = { title: "Markets" };

export default function Markets() {
  return (
    <>
      <PageHead
        kicker="Coverage · live from chain"
        title="Every dreamDEX perp market"
        sub={
          <>
            One link covers all of them. Marks refresh every five seconds, read straight from the pools on <b>Somnia Hideki</b>.
          </>
        }
        actions={[{ href: "/start", label: "Protect my positions" }]}
      />
      <section className="sec">
        <MarketTable />
      </section>
    </>
  );
}
