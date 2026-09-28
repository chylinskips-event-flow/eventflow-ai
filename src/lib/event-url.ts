/**
 * Buduje kanoniczny URL wydarzenia.
 * - Jeśli NEXT_PUBLIC_ROOT_DOMAIN jest ustawiony → subdomena: https://{slug}.{rootDomain}
 * - Inaczej (dev, preview bez env) → fallback na apex: {origin}/e/{slug}
 *
 * Działa zarówno server-side (origin z getOrigin(headers())), jak i
 * client-side (origin z window.location.origin) — NEXT_PUBLIC_ jest
 * wbudowany w bundle przez Next.js.
 */
export function buildEventUrl(slug: string, origin: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) {
    return `https://${slug}.${rootDomain}`;
  }
  return `${origin}/e/${slug}`;
}
