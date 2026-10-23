import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hoax",
  description: "Hoax cuts a dreamDEX perp position down to safe size before liquidation can take it, and proves every save with an on-chain receipt.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>
          <div className="wrap">
            {process.env.HOAX_DEMO === "1" && (
              <div className="notice info small" style={{ marginBottom: 16 }}>
                Demo data. This deployment runs without a watcher, and nothing here happened on chain.
              </div>
            )}
            {children}
          </div>
        </main>
        <footer>
          <div className="wrap">
            Hoax runs on dreamDEX perps, Somnia Tokyo testnet. It can trade a linked wallet but never withdraw from it.
            Unlink the bot in dreamDEX to revoke it completely.
          </div>
        </footer>
      </body>
    </html>
  );
}
