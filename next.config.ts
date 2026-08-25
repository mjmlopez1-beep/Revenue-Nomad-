import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DOCKER_BUILD=1 produces the self-contained .next/standalone server used
  // by the Dockerfile; plain `next build` + `next start` works everywhere else.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Ensure the seed database is bundled into serverless function output.
  outputFileTracingIncludes: {
    "/**": ["./data/seed.json", "./data/universe-crunchbase.json"],
  },
};

export default nextConfig;
