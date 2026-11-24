// robots.txt i sitemap.xml: adres kanoniczny platformy i ścieżki wyłączone z indeksowania.

/** Adres kanoniczny (apex) — jak w buildEventApexUrl: NEXT_PUBLIC_ROOT_DOMAIN, inaczej NEXT_PUBLIC_APP_URL. */
export function getSiteUrl(): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) return `https://${rootDomain}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl.replace(/\/+$/, "");
  return "https://eventro.pl";
}

// Ścieżki stron wydarzenia z tokenem/kodem albo prywatne — zarówno pod /e/{slug}/…, jak i na
// subdomenie wydarzenia ({slug}.domena/…), która przepisuje na /e/{slug}/….
const EVENT_PRIVATE_SEGMENTS = ["a/", "recepcja/", "posilek/", "booth/", "connect/", "checkout"];

export const ROBOTS_DISALLOW: string[] = [
  "/admin",
  "/onboarding",
  "/partner/",
  "/partner$",
  "/api/",
  "/auth/",
  "/g/",
  "/qa/",
  "/mod/",
  "/p/",
  "/suspended",
  ...EVENT_PRIVATE_SEGMENTS.map((s) => `/e/*/${s}`),
  ...EVENT_PRIVATE_SEGMENTS.map((s) => `/${s}`),
];

/** Strony marketingowe w sitemapie (bez stron wydarzeń — te linkuje organizator). */
export const SITEMAP_PATHS = ["/", "/privacy", "/terms"];
