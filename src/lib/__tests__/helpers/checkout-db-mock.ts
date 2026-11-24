// Atrapa klienta Supabase (service_role) dla testów kasy i webhooka płatności: zapisuje wywołania
// tabel i funkcji RPC, wyniki ustawiane per `tabela:operacja` albo nazwa funkcji.

export type TableCall = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: [string, unknown][];
};

type Result = { data: unknown; error: unknown; count?: number };

export function createCheckoutDbMock() {
  const calls: TableCall[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const results: Record<string, (c: TableCall) => Result> = {};
  const rpcResults: Record<string, (args: Record<string, unknown>) => Result> = {};

  function from(table: string) {
    const call: TableCall = { table, op: "select", filters: [] };
    const run = async (): Promise<Result> => {
      calls.push(call);
      const custom = results[`${table}:${call.op}`];
      if (custom) return custom(call);
      if (call.op === "insert")
        return { data: { id: `${table}-new`, qr_code_token: "qr-new", check_in_token: "ci-new" }, error: null };
      if (call.op === "select") return { data: null, error: null, count: 0 };
      return { data: null, error: null };
    };
    const filter = (k: string) => (v: unknown) => {
      call.filters.push([k, v]);
      return b;
    };
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      limit: () => b,
      eq: (k: string, v: unknown) => filter(`eq:${k}`)(v),
      is: (k: string, v: unknown) => filter(`is:${k}`)(v),
      in: (k: string, v: unknown) => filter(`in:${k}`)(v),
      gte: (k: string, v: unknown) => filter(`gte:${k}`)(v),
      lt: (k: string, v: unknown) => filter(`lt:${k}`)(v),
      like: (k: string, v: unknown) => filter(`like:${k}`)(v),
      ilike: (k: string, v: unknown) => filter(`ilike:${k}`)(v),
      not: (k: string, op: string, v: unknown) => filter(`not:${k}:${op}`)(v),
      insert: (p: unknown) => ((call.op = "insert"), (call.payload = p), b),
      update: (p: unknown) => ((call.op = "update"), (call.payload = p), b),
      delete: () => ((call.op = "delete"), b),
      maybeSingle: run,
      single: run,
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }

  async function rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    rpcCalls.push({ fn, args });
    const custom = rpcResults[fn];
    if (custom) return custom(args);
    return { data: true, error: null };
  }

  const inserts = (table: string) =>
    calls.filter((c) => c.table === table && c.op === "insert").map((c) => c.payload as Record<string, unknown>);
  const reset = () => {
    calls.length = 0;
    rpcCalls.length = 0;
    for (const k of Object.keys(results)) delete results[k];
    for (const k of Object.keys(rpcResults)) delete rpcResults[k];
  };
  return { client: { from, rpc }, calls, rpcCalls, results, rpcResults, inserts, reset };
}
