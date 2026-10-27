import type { MetadataRoute } from "next";

const SITE = process.env.URL ?? "https://usehoax.netlify.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/how-it-works", "/markets", "/security", "/stats", "/replay"].map((path) => ({ url: `${SITE}${path}` }));
}
