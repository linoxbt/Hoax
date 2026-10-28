import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Motion } from "@/components/Motion";
import { Notice } from "@/components/Notice";
import { Providers } from "@/lib/wallet";
import "./globals.css";

export const metadata: Metadata = {
  // The site's own address, wherever it is deployed (Netlify sets URL, Vercel VERCEL_PROJECT_PRODUCTION_URL).
  metadataBase: new URL(
    process.env.HOAX_SITE_URL ??
      process.env.URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://usehoax.netlify.app"),
  ),
  title: { default: "Hoax · Liquidation protection for dreamDEX perps", template: "%s · Hoax" },
  description: "Hoax cuts a dreamDEX perp position down to safe size before liquidation can take it, and proves every save with an on-chain receipt.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f5ef" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&display=swap" />
        {/* Netlify injects a comment (after a newline) into <head> on the live domain; React finds
            nodes it did not render and fails hydration (error 418). This runs first and drops both. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.classList.add('js');for(const n of [...document.head.childNodes])if((n.nodeType===8&&n.data.includes('hosted on Netlify'))||(n.nodeType===3&&!n.data.trim()))n.remove()",
          }}
        />
      </head>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
          <Motion />
          {process.env.HOAX_DEMO === "1" && <Notice />}
        </Providers>
      </body>
    </html>
  );
}
