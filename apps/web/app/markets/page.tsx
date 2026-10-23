import Link from "next/link";
import { Kicker } from "@/components/Kicker";
import { MarketTable } from "@/components/LiveMarkets";

export const metadata = { title: "Markets" };

export default function Markets() {
  return (
    <>
      <section className="sec alt">
        <div className="wrap pad" style={{ paddingBottom: 48 }}>
          <Kicker>Coverage · live from chain</Kicker>
          <h1 className="hero-in">Every dreamDEX perp market</h1>
          <div className="spread" style={{ marginTop: 28 }}>
            <p className="lede" style={{ maxWidth: 620 }}>
              One link covers all of them. Marks refresh every five seconds from the pools on Somnia Hideki.
            </p>
            <Link href="/start" className="pill">
              Protect my positions
            </Link>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap pad-s">
          <MarketTable />
        </div>
      </section>
    </>
  );
}
