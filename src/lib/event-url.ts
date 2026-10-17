/**
 * Buduje publiczny URL wydarzenia.
 * - Jeśli NEXT_PUBLIC_ROOT_DOMAIN jest ustawiony → apex: https://{rootDomain}/e/{slug}
 * - Inaczej (dev, preview bez env) → {origin}/e/{slug}
 *
 * Używaj do wszystkich linków wychodzących: „Udostępnij”, kopiowanie linku,
 * QR kontaktu, kanoniczny adres, powrót z płatności, maile. Subdomena
 * {slug}.{rootDomain} może nie być podpięta do Vercela (limit planu, błąd
 * addDomain), a adres apex działa zawsze. Subdomena jest pokazywana tylko jako
 * dodatkowy adres w Ustawieniach, gdy jest zweryfikowana; middleware dalej ją
 * obsługuje, więc stare linki na subdomenę działają, gdy zostanie podpięta.
 *
 * Działa server-side (origin z getOrigin(headers())) i client-side
 * (origin z window.location.origin) — NEXT_PUBLIC_ jest wbudowany w bundle.
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
