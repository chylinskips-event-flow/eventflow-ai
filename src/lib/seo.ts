// robots.txt i sitemap.xml: adres kanoniczny platformy i ścieżki wyłączone z indeksowania.

/** Adres kanoniczny (apex) — jak w buildEventApexUrl: NEXT_PUBLIC_ROOT_DOMAIN, inaczej NEXT_PUBLIC_APP_URL. */
export function getSiteUrl(): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) return `https://${rootDomain}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl.replace(/\/+$/, "");
  return "https://eventro.pl";
}

// Blokujemy tylko ścieżki bez treści do indeksowania. Stron z noindex (meta robots albo nagłówek
// X-Robots-Tag: panel, portal partnera, linki z tokenem, strony wydarzenia z tokenem — NOINDEX_PATHS
// w next.config.ts) celowo tu nie ma: robot, któremu zabroniono pobrania strony, nie zobaczy noindex
// i może zaindeksować sam adres.
export const ROBOTS_DISALLOW: string[] = ["/onboarding", "/api/", "/auth/"];

/** Strony marketingowe w sitemapie (bez stron wydarzeń — te linkuje organizator). */
export const SITEMAP_PATHS = ["/", "/privacy", "/terms"];
