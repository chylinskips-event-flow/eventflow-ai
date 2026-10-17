// Zakładki sterowane adresem (`?tab=`) — czysta logika wspólna dla ekranów z zakładkami
// (panel organizatora, panel partnera). Client-safe, bez Reacta.

/** `?tab=` → klucz widocznej zakładki; nieznana, ukryta albo pusta wartość → domyślna. */
export function resolveTabKey<K extends string>(raw: unknown, visible: readonly K[], fallback: K): K {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (visible as readonly string[]).includes(value) ? (value as K) : fallback;
}

/**
 * Stare linki z kotwicą (`#branding`, `#stoisko` z maili) → zakładka. Zwraca klucz tylko,
 * gdy kotwica pasuje do widocznej zakładki (wprost albo przez mapę aliasów).
 */
export function tabFromHash<K extends string>(
  hash: string,
  visible: readonly K[],
  aliases: Partial<Record<string, K>> = {},
): K | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (!id) return null;
  const key = (visible as readonly string[]).includes(id) ? (id as K) : aliases[id];
  return key && visible.includes(key) ? key : null;
}

/** Adres po zmianie zakładki: domyślna bez parametru, inne jako `?tab=`, bez starej kotwicy. */
export function urlForTab(href: string, key: string, defaultKey: string): string {
  const url = new URL(href);
  if (key === defaultKey) url.searchParams.delete("tab");
  else url.searchParams.set("tab", key);
  url.hash = "";
  return url.toString();
}
