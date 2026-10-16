// Minimalny mock klienta Supabase (service_role) do testów akcji: zapisuje każde wywołanie
// (tabela, operacja, payload, filtry) i zwraca wynik z `results` albo domyślny.

export type DbCall = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  filters: [string, unknown][];
};

type Result = { data: unknown; error: unknown };

export function createDbMock() {
  const calls: DbCall[] = [];
  /** Klucz `tabela:operacja` → wynik (funkcja dostaje wywołanie z filtrami). */
  const results: Record<string, (c: DbCall) => Result> = {};

  function from(table: string) {
    const call: DbCall = { table, op: "select", filters: [] };
    const run = async (): Promise<Result> => {
      calls.push(call);
      const custom = results[`${table}:${call.op}`];
      if (custom) return custom(call);
      if (call.op === "select") return { data: null, error: null };
      if (call.op === "insert") return { data: { id: "new-id" }, error: null };
      return { data: [{ id: "row-id" }], error: null };
    };
    const filter = (k: string, v: unknown) => {
      call.filters.push([k, v]);
      return b;
    };
    const b = {
      select: () => b,
      order: () => b,
      limit: () => b,
      not: () => b,
      eq: filter,
      is: filter,
      in: filter,
      gt: filter,
      insert: (p: unknown) => ((call.op = "insert"), (call.payload = p), b),
      update: (p: unknown) => ((call.op = "update"), (call.payload = p), b),
      upsert: (p: unknown) => ((call.op = "upsert"), (call.payload = p), b),
      delete: () => ((call.op = "delete"), b),
      maybeSingle: run,
      single: run,
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }

  const writes = () => calls.filter((c) => c.op !== "select");
  const reset = () => {
    calls.length = 0;
    for (const k of Object.keys(results)) delete results[k];
  };
  return { client: { from }, calls, results, writes, reset };
}
