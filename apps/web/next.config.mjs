/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@hoax/core", "@hoax/db", "@hoax/chain"],
  serverExternalPackages: ["pg", "@somnia-chain/markets-sdk", "@somnia-chain/accounts-sdk", "ws"],
  poweredByHeader: false,
  // The client reads demo mode to offer the sample account.
  env: { NEXT_PUBLIC_HOAX_DEMO: process.env.HOAX_DEMO === "1" ? "1" : "" },
};
export default nextConfig;
