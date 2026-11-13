import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Motion } from "@/components/Motion";
import { Notice } from "@/components/Notice";
import { Providers } from "@/lib/wallet";
import "./globals.css";
import "./styles/home.css";
import "./styles/radar.css";
import "./styles/pages.css";
import "./styles/start.css";
import "./styles/dash.css";

export const metadata: Metadata = {
  // The site's own address, wherever it is deployed (Netlify sets URL, Vercel VERCEL_PROJECT_PRODUCTION_URL).
  metadataBase: new URL(
    process.env.HOAX_SITE_URL ??
      process.env.URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://usehoax.netlify.app"),
  ),
  title: { default: "Hoax · Market intelligence for dreamDEX perps", template: "%s · Hoax" },
  description: "From billions of trades to one clear signal. Hoax reads every liquidation on dreamDEX perps as it happens, and protects your positions before the engine can take them.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f9fe" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
        <link rel="preload" href="/fonts/satoshi-500.woff2" as="font" type="font/woff2" crossOrigin="" />
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
