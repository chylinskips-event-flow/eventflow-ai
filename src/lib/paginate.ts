// PostgREST zwraca najwyżej max_rows wierszy na zapytanie (u nas 1000) i robi to po cichu.
// Gdy potrzebny jest komplet wierszy, pobieramy je stronami przez .range(from, to).
// Zapytanie musi mieć stabilny porządek (np. .order("id")), inaczej strony mogą się nakładać.

export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Pobiera wszystkie wiersze, wywołując `page(from, to)` dla kolejnych zakresów, aż strona
 * wróci niepełna. `maxRows` to bezpiecznik przed nieskończoną pętlą.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<{ data: T[]; error: unknown }> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxRows = opts.maxRows ?? 200_000;
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: all, error: null };
}

/**
 * Usuwa powtórzenia po `id`, zachowując pierwsze wystąpienie i kolejność. Stronicowanie przez
 * offset nie jest odporne na zapisy między zapytaniami: gdy wiersz wejdzie do zbioru (lub z niego
 * wypadnie) przed bieżącym offsetem, ostatni wiersz strony może wrócić na początku następnej.
 */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
