import type { NextConfig } from "next";

// Every Projects prototype URL renders the same client app, which routes on the path itself.
const PROJECT_AREAS = ["buyer", "admin", "operators", "client", "projects", "dashboard"];

const nextConfig: NextConfig = {
  // DOCKER_BUILD=1 produces the self-contained .next/standalone server used
  // by the Dockerfile; plain `next build` + `next start` works everywhere else.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Ensure the seed database is bundled into serverless function output.
  outputFileTracingIncludes: {
    "/**": ["./data/seed.json", "./data/universe-crunchbase.json"],
  },
  // The operator flow lives in the dashboard; old /operator links (emails, bookmarks) land there.
  async redirects() {
    return [
      { source: "/operator/roles", destination: "/dashboard/projects?tab=open", permanent: false },
      { source: "/operator/projects", destination: "/dashboard/projects", permanent: false },
      { source: "/operator/:path*", destination: "/dashboard/:path*", permanent: false },
      { source: "/operator", destination: "/dashboard", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/dashboard", destination: "/rnp-app" },
      ...PROJECT_AREAS.map((area) => ({ source: `/${area}/:path*`, destination: "/rnp-app" })),
    ];
  },
};

export default nextConfig;
