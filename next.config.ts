import type { NextConfig } from "next";

// Panel organizatora nie trafia do wyszukiwarek — nagłówek działa także dla przekierowań (np. /admin → /login),
// niezależnie od meta robots ustawionych w layoutach.
// Strony wydarzenia z tokenem/kodem w adresie (bilet, recepcja, posiłek, stoisko, kontakt, płatność)
// też dostają noindex — pod /e/{slug}/… i na subdomenie wydarzenia ({slug}.domena/…), bo nagłówki
// są dopasowywane do ścieżki żądania przed przepisaniem jej przez middleware.
export const EVENT_PRIVATE_SEGMENTS = ["a", "recepcja", "posilek", "booth", "connect", "checkout"];

export const NOINDEX_PATHS = [
  "/admin",
  "/admin/:path*",
  "/g/:path*",
  ...EVENT_PRIVATE_SEGMENTS.flatMap((s) => [`/e/:slug/${s}`, `/e/:slug/${s}/:path*`, `/${s}`, `/${s}/:path*`]),
];

// Nagłówki bezpieczeństwa dla wszystkich odpowiedzi.
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// Ochrona przed osadzaniem w ramce z obcej domeny (clickjacking). Bez restrykcyjnego CSP dla
// skryptów — tylko frame-ancestors. Wyłączone ekrany rzutnika (/qa/{token} — pytania z sali,
// /p/{token} — plan Mixera): są tylko do odczytu i bywają osadzane w narzędziach do transmisji
// i prezentacji.
export const FRAME_PROTECTED_SOURCE = "/((?!qa/|p/).*)";
export const FRAME_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "heic-decode", "libheif-js"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      { source: FRAME_PROTECTED_SOURCE, headers: FRAME_HEADERS },
      ...NOINDEX_PATHS.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
};

export default nextConfig;
