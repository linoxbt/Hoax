/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@hoax/core", "@hoax/db", "@hoax/chain"],
  serverExternalPackages: ["pg", "@somnia-chain/markets-sdk", "@somnia-chain/accounts-sdk", "ws"],
  poweredByHeader: false,
  // The client reads demo mode to offer the sample account.
  env: { NEXT_PUBLIC_HOAX_DEMO: process.env.HOAX_DEMO === "1" ? "1" : "" },
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
