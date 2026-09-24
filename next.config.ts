import type { NextConfig } from "next";

// Every Projects prototype URL renders the same client app, which routes on the path itself.
const PROJECT_AREAS = ["buyer", "operator", "admin", "operators", "client", "projects"];

const nextConfig: NextConfig = {
  // DOCKER_BUILD=1 produces the self-contained .next/standalone server used
  // by the Dockerfile; plain `next build` + `next start` works everywhere else.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Ensure the seed database is bundled into serverless function output.
  outputFileTracingIncludes: {
    "/**": ["./data/seed.json", "./data/universe-crunchbase.json"],
  },
  async rewrites() {
    return PROJECT_AREAS.map((area) => ({ source: `/${area}/:path*`, destination: "/rnp-app" }));
  },
};

export default nextConfig;
