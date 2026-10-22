import type { NextConfig } from "next";

// Panel organizatora nie trafia do wyszukiwarek — nagłówek działa także dla przekierowań (np. /admin → /login),
// niezależnie od meta robots ustawionych w layoutach.
export const NOINDEX_PATHS = ["/admin", "/admin/:path*"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return NOINDEX_PATHS.map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
};

export default nextConfig;
