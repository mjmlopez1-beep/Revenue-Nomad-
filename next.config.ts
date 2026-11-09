import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DOCKER_BUILD=1 produces the self-contained .next/standalone server used
  // by the Dockerfile; plain `next build` + `next start` works everywhere else.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Ensure the seed database is bundled into serverless function output.
  outputFileTracingIncludes: {
    "/**": ["./data/seed.json", "./data/universe-crunchbase.json"],
  },
  // The report was renamed to the Buyer's Guide; keep the old address working.
  async redirects() {
    return [
      { source: "/research/state-of-fractional-gtm-2027", destination: "/fractional-gtm-buyers-guide-2027", permanent: true },
      { source: "/research/state-of-fractional-gtm-2027/:path*", destination: "/fractional-gtm-buyers-guide-2027/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
