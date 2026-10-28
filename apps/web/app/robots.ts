import type { MetadataRoute } from "next";

const SITE = process.env.URL ?? "https://usehoax.netlify.app";

// Wallet pages and the API are per-visitor; only the public pages are worth indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/start", "/api/"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
