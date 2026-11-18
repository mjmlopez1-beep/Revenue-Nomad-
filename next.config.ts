import type { NextConfig } from "next";

/**
 * Sent with every page and API answer. No Content-Security-Policy yet (it needs a per-request
 * nonce for Next's inline scripts). HSTS only takes effect over https, so localhost is unchanged.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // DOCKER_BUILD=1 produces the self-contained .next/standalone server used
  // by the Dockerfile; plain `next build` + `next start` works everywhere else.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
