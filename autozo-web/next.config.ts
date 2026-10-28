import type { NextConfig } from 'next';

// The cPanel host caps processes and has no native SWC, so its deploy script
// sets AUTOZO_LOW_RESOURCE=1: one build worker, no forked webpack worker, and
// type checks left to CI (they take minutes under the WASM compiler there).
const lowResource = process.env.AUTOZO_LOW_RESOURCE === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Photos already come pre-sized from the API (?w=480), and the built-in
    // optimizer would load sharp into the live site, whose thread pool
    // (one thread per server CPU) eats the host's process limit.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  ...(lowResource
    ? {
        typescript: { ignoreBuildErrors: true },
        experimental: { cpus: 1, workerThreads: true, webpackBuildWorker: false },
      }
    : {}),
};

export default nextConfig;
