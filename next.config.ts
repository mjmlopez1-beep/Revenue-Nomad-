import type { NextConfig } from "next";

// Every Projects prototype URL renders the same client app, which routes on the path itself.
const PROJECT_AREAS = ["buyer", "admin", "operators", "client", "projects"];

const nextConfig: NextConfig = {
  // DOCKER_BUILD=1 produces the self-contained .next/standalone server used
  // by the Dockerfile; plain `next build` + `next start` works everywhere else.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Ensure the seed database is bundled into serverless function output.
  outputFileTracingIncludes: {
    "/**": ["./data/seed.json", "./data/universe-crunchbase.json"],
  },
  // Operators work inside the Operator Portal; old /operator links (emails, bookmarks) land there.
  async redirects() {
    return [
      { source: "/operator/projects/:id", destination: "/portal?view=projects&project=:id", permanent: false },
      { source: "/operator/projects", destination: "/portal?view=projects", permanent: false },
      { source: "/operator/roles", destination: "/portal?view=projects&tab=roles", permanent: false },
      { source: "/operator/availability", destination: "/portal?view=projects&tab=availability", permanent: false },
      { source: "/operator", destination: "/portal?view=projects", permanent: false },
    ];
  },
  async rewrites() {
    return PROJECT_AREAS.map((area) => ({ source: `/${area}/:path*`, destination: "/rnp-app" }));
  },
};

export default nextConfig;
