// The hosts a sign-in message may name (lib/auth.ts): HOAX_SITE_HOSTS, plus the
// URLs Netlify and Vercel set at build time. Captured here because the platforms
// only set them for the build. A production deployment with none refuses sign-in.
const allowedHosts = [
  process.env.HOAX_SITE_HOSTS,
  process.env.URL,
  process.env.DEPLOY_PRIME_URL,
  process.env.DEPLOY_URL,
  process.env.SITE_NAME ? `${process.env.SITE_NAME}.netlify.app` : "",
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_URL,
]
  .filter(Boolean)
  .join(",");

// Which platform serves the app, so lib/server.ts trusts only that platform's
// own client-IP header for rate limits.
const platform = process.env.NETLIFY === "true" ? "netlify" : process.env.VERCEL === "1" ? "vercel" : "";

// Clickjacking: a page that asks a wallet to sign must never sit inside someone
// else's frame, so framing is refused outright. The rest locks down what the page
// itself cannot need. Netlify already sends HSTS and nosniff; they are set here too
// for any other host, and a duplicate of the same value is harmless.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@hoax/core", "@hoax/db", "@hoax/chain"],
  serverExternalPackages: ["pg", "@somnia-chain/markets-sdk", "@somnia-chain/accounts-sdk", "ws"],
  poweredByHeader: false,
  // The client reads demo mode to offer the sample account.
  env: { NEXT_PUBLIC_HOAX_DEMO: process.env.HOAX_DEMO === "1" ? "1" : "", HOAX_ALLOWED_HOSTS: allowedHosts, HOAX_PLATFORM: platform },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack: (config) => {
    // Optional dependencies of WalletConnect's logger and storage that never run in the browser.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Optional imports Hoax never reaches: MetaMask SDK's React Native storage, and
    // the x402 payment helpers of the Coinbase SDK behind the Base Account connector.
    for (const m of ["@react-native-async-storage/async-storage", "@x402/core/client", "@x402/evm", "@x402/evm/exact/client", "@x402/evm/upto/client", "@x402/svm/exact/client"]) config.resolve.alias[m] = false;
    return config;
  },
};
export default nextConfig;
