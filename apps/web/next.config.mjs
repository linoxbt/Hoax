/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@hoax/core", "@hoax/db", "@hoax/chain"],
  serverExternalPackages: ["pg", "@somnia-chain/markets-sdk", "ws"],
  poweredByHeader: false,
};
export default nextConfig;
