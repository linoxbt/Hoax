import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hoax",
  description: "Hoax cuts a dreamDEX perp position down to safe size before liquidation can take it, and proves every save with an on-chain receipt.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2c2824" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Forum&family=IBM+Plex+Mono:wght@400;500&family=Michroma&display=swap"
        />
      </head>
      <body>
        <Header />
        {process.env.HOAX_DEMO === "1" && (
          <div className="sec char" style={{ borderBottom: "1px solid var(--rule-on-char)" }}>
            <div className="wrap cap" style={{ padding: "8px var(--gutter)", textAlign: "center" }}>
              Demo data · this deployment runs without a watcher, and nothing shown here happened on chain
            </div>
          </div>
        )}
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
