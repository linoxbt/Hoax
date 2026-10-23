import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Motion } from "@/components/Motion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hoax",
  description: "Hoax cuts a dreamDEX perp position down to safe size before liquidation can take it, and proves every save with an on-chain receipt.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2c2824" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Forum&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Michroma&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <Header />
        {process.env.HOAX_DEMO === "1" && (
          <div className="sec char" style={{ borderBottom: "1px solid var(--rule-on-char)" }}>
            <div className="wrap cap" style={{ padding: "8px var(--gutter)", textAlign: "center" }}>
              Demo data · live protection starts once the watcher is connected
            </div>
          </div>
        )}
        <main>{children}</main>
        <Footer />
        <Motion />
      </body>
    </html>
  );
}
