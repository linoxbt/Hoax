// The hosts a sign-in message may name (lib/auth.ts): HOAX_SITE_HOSTS, plus the
// URLs Netlify sets at build time. Captured here because Netlify only sets them for the build.
const allowedHosts = [
  process.env.HOAX_SITE_HOSTS,
  process.env.URL,
  process.env.DEPLOY_PRIME_URL,
  process.env.DEPLOY_URL,
  process.env.SITE_NAME ? `${process.env.SITE_NAME}.netlify.app` : "",
]
  .filter(Boolean)
  .join(",");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@hoax/core", "@hoax/db", "@hoax/chain"],
  serverExternalPackages: ["pg", "@somnia-chain/markets-sdk", "@somnia-chain/accounts-sdk", "ws"],
  poweredByHeader: false,
  // Netlify already sends HSTS and nosniff. A page that asks a wallet to sign must
  // never sit inside someone else's frame, so framing is refused outright.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  // The client reads demo mode to offer the sample account.
  env: { NEXT_PUBLIC_HOAX_DEMO: process.env.HOAX_DEMO === "1" ? "1" : "", HOAX_ALLOWED_HOSTS: allowedHosts },
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
