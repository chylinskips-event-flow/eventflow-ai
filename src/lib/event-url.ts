/**
 * Buduje kanoniczny URL wydarzenia.
 * - Jeśli NEXT_PUBLIC_ROOT_DOMAIN jest ustawiony → subdomena: https://{slug}.{rootDomain}
 * - Inaczej (dev, preview bez env) → fallback na apex: {origin}/e/{slug}
 *
 * Działa zarówno server-side (origin z getOrigin(headers())), jak i
 * client-side (origin z window.location.origin) — NEXT_PUBLIC_ jest
 * wbudowany w bundle przez Next.js.
 *
 * NIE używaj tego w mailach wychodzących — subdomena może nie być podpięta.
 * Do maili używaj buildEventApexUrl.
 */
export function buildEventUrl(slug: string, origin: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) {
    return `https://${slug}.${rootDomain}`;
  }
  return `${origin}/e/${slug}`;
}

/**
 * Buduje URL apexowy dla linków wychodzących w mailach.
 * Zawsze używa https://{rootDomain}/e/{slug} — niezależnie od stanu subdomeny.
 * Subdomena może nie być podpięta do Vercela (limit planu, błąd addDomain),
 * więc linki krytyczne (wejście uczestnika, QR biletu) muszą iść przez apex.
 */
export function buildEventApexUrl(slug: string, origin: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) {
    return `https://${rootDomain}/e/${slug}`;
  }
  return `${origin}/e/${slug}`;
}

/**
 * Zwraca prefiks ścieżki dla wewnętrznych linków eventu.
 * - Na subdomenie eventu ({slug}.{rootDomain}) → '' (pusty — subdomena już implikuje event)
 * - Inaczej → '/e/{slug}'
 *
 * Użyj tego jako `basePath` w komponentach klienckich (BottomNav itp.).
 */
export function buildEventBasePath(slug: string, origin: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) {
    try {
      const hostname = new URL(origin).hostname;
      if (hostname === `${slug}.${rootDomain}`) return "";
    } catch {
      // ignore
    }
  }
  return `/e/${slug}`;
}

/**
 * Buduje ścieżkę wewnętrznego linku eventu świadomą subdomeny.
 * - Na subdomenie eventu → `path` (bez prefiksu /e/{slug})
 * - Inaczej → `/e/{slug}${path}`
 *
 * Przykład: buildEventInternalPath('cyber-hr', '/register', origin)
 *   → '/register' (subdomena) lub '/e/cyber-hr/register' (apex/dev)
 */
export function buildEventInternalPath(slug: string, path: string, origin: string): string {
  return buildEventBasePath(slug, origin) + path;
}
