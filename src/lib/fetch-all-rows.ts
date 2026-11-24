// Pobranie WSZYSTKICH wierszy zapytania stronami. PostgREST obcina każdą odpowiedź do
// max_rows (1000 w Supabase) bez błędu, więc zapytanie bez stronicowania po cichu gubi
// resztę. Zapytanie musi mieć deterministyczny porządek (np. z id na końcu), inaczej strony
// mogą się nakładać.

export const FETCH_PAGE_SIZE = 1000;
/** Bezpiecznik: najwyżej tyle stron (domyślnie 50 × 1000 wierszy). */
export const FETCH_MAX_PAGES = 50;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PageResult<T>,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<{ data: T[]; error: { message: string } | null }> {
  const pageSize = opts.pageSize ?? FETCH_PAGE_SIZE;
  const maxPages = opts.maxPages ?? FETCH_MAX_PAGES;
  const rows: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const from = i * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { data: rows, error: null };
}
