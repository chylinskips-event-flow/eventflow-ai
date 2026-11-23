// Zmiana stanu magazynu nagrody o ±1 względem AKTUALNEJ wartości w bazie (compare-and-set
// z ponowieniem), a nie względem wartości odczytanej wcześniej w akcji. Dzięki temu
// cofnięcie dekrementacji przywraca dokładnie jedną sztukę, a równoległe wydania nie
// nadpisują się nawzajem.

type Result = { data: unknown; error: unknown };
type Chain = PromiseLike<Result> & {
  select: (cols: string) => Chain;
  update: (p: unknown) => Chain;
  eq: (k: string, v: unknown) => Chain;
  maybeSingle: () => PromiseLike<Result>;
};
type Db = { from: (table: string) => unknown };

const MAX_TRIES = 5;

export type StockChange =
  | { ok: true; stock: number | null }
  | { ok: false; reason: "not_found" | "out_of_stock" | "conflict" };

/**
 * delta = -1: wydanie sztuki (odmowa przy stanie <= 0); delta = +1: zwrot sztuki.
 * stock = NULL (magazyn nielimitowany) → nic nie zmienia, ok z stock=null.
 */
export async function changeRewardStock(
  db: Db,
  rewardId: string,
  eventId: string,
  delta: 1 | -1,
): Promise<StockChange> {
  const table = () => db.from("rewards") as Chain;
  for (let i = 0; i < MAX_TRIES; i++) {
    const { data } = await table().select("stock").eq("id", rewardId).eq("event_id", eventId).maybeSingle();
    if (!data) return { ok: false, reason: "not_found" };
    const current = (data as { stock: number | null }).stock;
    if (current === null) return { ok: true, stock: null };
    if (delta < 0 && current <= 0) return { ok: false, reason: "out_of_stock" };

    const next = current + delta;
    const { data: updated } = await table()
      .update({ stock: next })
      .eq("id", rewardId)
      .eq("event_id", eventId)
      .eq("stock", current)
      .select("id");
    if (Array.isArray(updated) && updated.length > 0) return { ok: true, stock: next };
    // Ktoś zmienił stan w międzyczasie — odczytaj ponownie.
  }
  return { ok: false, reason: "conflict" };
}
