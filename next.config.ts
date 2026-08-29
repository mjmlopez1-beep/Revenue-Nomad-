import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // The JSON seed database must ship with the server bundle.
    "/": ["./data/**/*"],
  },
};

export default nextConfig;
