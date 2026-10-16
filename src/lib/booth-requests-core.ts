// #10 Faza A2 — zapotrzebowanie partnera na stoisko: czysta logika (bez I/O), testowalna
// jednostkowo i bezpieczna dla klienta. I/O: src/lib/booth-requests.ts.

import { PARTNER_TIERS } from "@/lib/partner-options";
import { formatDateTime, formatDateTimeRange } from "@/lib/format";

export const CATALOG_NAME_MAX_LENGTH = 120;
export const CATALOG_UNIT_MAX_LENGTH = 20;
export const CATALOG_DESCRIPTION_MAX_LENGTH = 500;
export const MAX_CATALOG_ITEMS = 60;
export const ITEM_QTY_MAX = 999;
export const ITEM_NOTE_MAX_LENGTH = 1000;
export const OTHER_NEEDS_MAX_LENGTH = 1000;
export const VEHICLE_NOTE_MAX_LENGTH = 500;
export const DECISION_NOTE_MAX_LENGTH = 1000;
export const CREW_MAX = 500;
/** Etykieta pozycji „Inne potrzeby” (catalog_item_id NULL, treść w note). */
export const OTHER_NEEDS_LABEL = "Inne potrzeby";

export type TierKey = (typeof PARTNER_TIERS)[number]["value"];
export const TIER_KEYS = PARTNER_TIERS.map((t) => t.value) as TierKey[];

/** Domyślny zestaw startowy katalogu — wstawiany raz, potem do edycji / usunięcia. */
export const DEFAULT_BOOTH_CATALOG: { name: string; unit: string }[] = [
  { name: "Stół", unit: "szt." },
  { name: "Krzesło", unit: "szt." },
  { name: "Gniazdko 230 V", unit: "szt." },
  { name: "Przedłużacz", unit: "szt." },
  { name: "Ekran / TV", unit: "szt." },
  { name: "Internet LAN", unit: "szt." },
  { name: "Wi-Fi dedykowane", unit: "szt." },
  { name: "Ścianka / roll-up", unit: "szt." },
  { name: "Oświetlenie dodatkowe", unit: "szt." },
  { name: "Zabudowa stoiska", unit: "szt." },
  { name: "Magazyn / miejsce na kartony", unit: "szt." },
];

export type IncludedByTier = Partial<Record<TierKey, number>>;

export type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  included_by_tier: IncludedByTier;
};

export type LogisticsSettings = {
  request_deadline: string | null;
  setup_from: string | null;
  setup_to: string | null;
  teardown_from: string | null;
  teardown_to: string | null;
};

export const EMPTY_SETTINGS: LogisticsSettings = {
  request_deadline: null,
  setup_from: null,
  setup_to: null,
  teardown_from: null,
  teardown_to: null,
};

export type ItemStatus = "pending" | "approved" | "changed" | "rejected";

export type RequestItem = {
  id: string;
  catalog_item_id: string | null;
  label: string;
  unit: string;
  qty: number;
  note: string | null;
  status: ItemStatus;
  approved_qty: number | null;
  decision_note: string | null;
  reviewed_at: string | null;
};

export type BoothRequestInfo = {
  crew_count: number | null;
  setup_start: string | null;
  setup_end: string | null;
  teardown_start: string | null;
  teardown_end: string | null;
  vehicle: boolean;
  vehicle_note: string | null;
};

export type BoothRequest = BoothRequestInfo & {
  id: string;
  partner_id: string;
  submitted_at: string;
  late_change_at: string | null;
  items: RequestItem[];
};

export const ITEM_STATUS: Record<ItemStatus, { label: string; variant: "warning" | "success" | "indigo" | "destructive" }> = {
  pending: { label: "Do akceptacji", variant: "warning" },
  approved: { label: "Zatwierdzone", variant: "success" },
  changed: { label: "Zatwierdzono inną ilość", variant: "indigo" },
  rejected: { label: "Odrzucone", variant: "destructive" },
};

// ── Katalog ────────────────────────────────────────────────────────────────

/** jsonb z bazy → limity per poziom (tylko znane poziomy, liczby całkowite ≥ 0). */
export function parseIncludedByTier(raw: unknown): IncludedByTier {
  const out: IncludedByTier = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of TIER_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) out[key] = v;
  }
  return out;
}

/** Ile sztuk pozycji jest w pakiecie partnera; null = brak limitu dla tego poziomu. */
export function includedFor(item: Pick<CatalogItem, "included_by_tier">, tier: string | null): number | null {
  if (!tier) return null;
  const v = item.included_by_tier[tier as TierKey];
  return typeof v === "number" ? v : null;
}

export function isOverPackage(qty: number, included: number | null): boolean {
  return included !== null && qty > included;
}

type Getter = (key: string) => FormDataEntryValue | null;

function text(get: Getter, key: string): string {
  const v = get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Liczba całkowita z pola formularza; "" → null; niepoprawna → NaN. */
function int(get: Getter, key: string): number | null {
  const raw = text(get, key);
  if (!raw) return null;
  return /^\d+$/.test(raw) ? Number(raw) : NaN;
}

export type CatalogInput = Omit<CatalogItem, "id" | "sort_order">;

export function validateCatalogInput(get: Getter): { ok: true; value: CatalogInput } | { ok: false; error: string } {
  const name = text(get, "name");
  if (!name) return { ok: false, error: "Podaj nazwę pozycji." };
  if (name.length > CATALOG_NAME_MAX_LENGTH) return { ok: false, error: `Nazwa może mieć najwyżej ${CATALOG_NAME_MAX_LENGTH} znaków.` };
  const unit = text(get, "unit") || "szt.";
  if (unit.length > CATALOG_UNIT_MAX_LENGTH) return { ok: false, error: `Jednostka może mieć najwyżej ${CATALOG_UNIT_MAX_LENGTH} znaków.` };
  const description = text(get, "description") || null;
  if (description && description.length > CATALOG_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, error: `Opis może mieć najwyżej ${CATALOG_DESCRIPTION_MAX_LENGTH} znaków.` };
  }
  const included_by_tier: IncludedByTier = {};
  for (const tier of TIER_KEYS) {
    const v = int(get, `included_${tier}`);
    if (v === null) continue;
    if (Number.isNaN(v) || v > ITEM_QTY_MAX) return { ok: false, error: "Limit w pakiecie: liczba całkowita od 0 do 999." };
    included_by_tier[tier] = v;
  }
  return { ok: true, value: { name, unit, description, active: get("active") !== "false", included_by_tier } };
}

// ── Ustawienia ─────────────────────────────────────────────────────────────

export function isAfterDeadline(deadline: string | null, now: number): boolean {
  return !!deadline && new Date(deadline).getTime() < now;
}

/** Zakres godzin do wyświetlenia (strefa eventu); null, gdy nieustawiony. */
export function logisticsRangeLabel(from: string | null, to: string | null, timeZone: string | null): string | null {
  if (from && to) return formatDateTimeRange(from, to, timeZone);
  if (from) return `od ${formatDateTime(from, timeZone)}`;
  if (to) return `do ${formatDateTime(to, timeZone)}`;
  return null;
}

export function validateSettings(s: LogisticsSettings): string | null {
  const before = (a: string | null, b: string | null) => !a || !b || new Date(a).getTime() < new Date(b).getTime();
  if (!before(s.setup_from, s.setup_to)) return "Montaż: początek zakresu musi być przed końcem.";
  if (!before(s.teardown_from, s.teardown_to)) return "Demontaż: początek zakresu musi być przed końcem.";
  return null;
}

// ── Wniosek partnera ───────────────────────────────────────────────────────

export type DesiredItem = {
  catalog_item_id: string | null;
  label: string;
  unit: string;
  qty: number;
  note: string | null;
};

/**
 * Pozycje z formularza partnera: `qty_<id>` i `note_<id>` dla aktywnych pozycji katalogu,
 * `other_needs` → pozycja „Inne potrzeby”. Ilość 0 / puste = brak pozycji.
 */
export function parseRequestItems(
  get: Getter,
  catalog: Pick<CatalogItem, "id" | "name" | "unit" | "active">[],
): { ok: true; value: DesiredItem[] } | { ok: false; error: string } {
  const out: DesiredItem[] = [];
  for (const c of catalog) {
    if (!c.active) continue;
    const qty = int(get, `qty_${c.id}`);
    if (qty === null || qty === 0) continue;
    if (Number.isNaN(qty) || qty > ITEM_QTY_MAX) return { ok: false, error: `${c.name}: ilość od 0 do ${ITEM_QTY_MAX}.` };
    const note = text(get, `note_${c.id}`) || null;
    if (note && note.length > ITEM_NOTE_MAX_LENGTH) return { ok: false, error: `${c.name}: uwaga może mieć najwyżej ${ITEM_NOTE_MAX_LENGTH} znaków.` };
    out.push({ catalog_item_id: c.id, label: c.name, unit: c.unit, qty, note });
  }
  const other = text(get, "other_needs");
  if (other) {
    if (other.length > OTHER_NEEDS_MAX_LENGTH) return { ok: false, error: `„Inne potrzeby” mogą mieć najwyżej ${OTHER_NEEDS_MAX_LENGTH} znaków.` };
    out.push({ catalog_item_id: null, label: OTHER_NEEDS_LABEL, unit: "—", qty: 1, note: other });
  }
  return { ok: true, value: out };
}

/**
 * Informacje o stoisku. Godziny przychodzą już jako ISO (konwersja ze strefy eventu
 * w akcji). Zakresy organizatora, jeśli ustawione, ograniczają godziny montażu/demontażu.
 */
export function validateRequestInfo(
  info: BoothRequestInfo,
  settings: LogisticsSettings,
): string | null {
  if (info.crew_count !== null && (!Number.isInteger(info.crew_count) || info.crew_count < 0 || info.crew_count > CREW_MAX)) {
    return `Liczba osób obsługi: od 0 do ${CREW_MAX}.`;
  }
  if (info.vehicle_note && info.vehicle_note.length > VEHICLE_NOTE_MAX_LENGTH) {
    return `Uwaga o rozładunku może mieć najwyżej ${VEHICLE_NOTE_MAX_LENGTH} znaków.`;
  }
  const t = (v: string | null) => (v ? new Date(v).getTime() : null);
  const check = (label: string, start: string | null, end: string | null, from: string | null, to: string | null) => {
    const [s, e, f, u] = [t(start), t(end), t(from), t(to)];
    if (s !== null && e !== null && s >= e) return `${label}: początek musi być przed końcem.`;
    for (const v of [s, e]) {
      if (v === null) continue;
      if ((f !== null && v < f) || (u !== null && v > u)) return `${label}: godziny spoza zakresu ustalonego przez organizatora.`;
    }
    return null;
  };
  return (
    check("Montaż", info.setup_start, info.setup_end, settings.setup_from, settings.setup_to) ??
    check("Demontaż", info.teardown_start, info.teardown_end, settings.teardown_from, settings.teardown_to)
  );
}

export type ItemPlan = {
  inserts: DesiredItem[];
  /** Zmienione pozycje — wracają do akceptacji (decyzja czyszczona). */
  updates: (DesiredItem & { id: string })[];
  deletes: string[];
  /** Bez zmian — decyzja organizatora zostaje. */
  unchanged: string[];
};

const itemKey = (i: { catalog_item_id: string | null }) => i.catalog_item_id ?? "__other__";

/**
 * Zmiana wniosku: tylko pozycje o innej ilości lub uwadze wracają do akceptacji,
 * reszta zachowuje decyzję. Pozycje usunięte (ilość 0) znikają z wniosku.
 */
export function planRequestItems(
  existing: RequestItem[],
  desired: DesiredItem[],
  /** Pozycje katalogu wyłączone przez organizatora — zgłoszenia na nie zostają bez zmian. */
  lockedCatalogIds: ReadonlySet<string> = new Set(),
): ItemPlan {
  const byKey = new Map(existing.map((e) => [itemKey(e), e]));
  const plan: ItemPlan = { inserts: [], updates: [], deletes: [], unchanged: [] };
  const seen = new Set<string>();
  for (const e of existing) {
    if (e.catalog_item_id && lockedCatalogIds.has(e.catalog_item_id)) {
      seen.add(itemKey(e));
      plan.unchanged.push(e.id);
    }
  }
  for (const d of desired) {
    if (d.catalog_item_id && lockedCatalogIds.has(d.catalog_item_id)) continue;
    const key = itemKey(d);
    seen.add(key);
    const cur = byKey.get(key);
    if (!cur) plan.inserts.push(d);
    else if (cur.qty !== d.qty || (cur.note ?? null) !== (d.note ?? null)) plan.updates.push({ ...d, id: cur.id });
    else plan.unchanged.push(cur.id);
  }
  for (const e of existing) if (!seen.has(itemKey(e))) plan.deletes.push(e.id);
  return plan;
}

export function hasPlanChanges(plan: ItemPlan): boolean {
  return plan.inserts.length + plan.updates.length + plan.deletes.length > 0;
}

// ── Status i ilości ────────────────────────────────────────────────────────

export type RequestStatus =
  | { kind: "none" }
  | { kind: "pending"; count: number }
  | { kind: "partial" }
  | { kind: "approved" }
  | { kind: "rejected" };

/**
 * Status wniosku (badge na karcie partnera): oczekujące mają pierwszeństwo; wszystkie
 * zatwierdzone bez zmian → „Zatwierdzone”; wszystkie odrzucone → „Odrzucone”;
 * mieszanka albo zatwierdzona inna ilość → „Częściowo zatwierdzone”.
 */
export function requestStatus(items: Pick<RequestItem, "status">[] | null): RequestStatus {
  if (!items || items.length === 0) return { kind: "none" };
  const pending = items.filter((i) => i.status === "pending").length;
  if (pending > 0) return { kind: "pending", count: pending };
  if (items.every((i) => i.status === "approved")) return { kind: "approved" };
  if (items.every((i) => i.status === "rejected")) return { kind: "rejected" };
  return { kind: "partial" };
}

export function requestStatusLabel(s: RequestStatus): string {
  switch (s.kind) {
    case "none":
      return "Brak wniosku";
    case "pending":
      return `Do akceptacji (${s.count})`;
    case "partial":
      return "Częściowo zatwierdzone";
    case "approved":
      return "Zatwierdzone";
    case "rejected":
      return "Odrzucone";
  }
}

/** Ilość zatwierdzona (0 dla oczekujących i odrzuconych). */
export function approvedQty(i: Pick<RequestItem, "status" | "qty" | "approved_qty">): number {
  if (i.status === "approved") return i.qty;
  if (i.status === "changed") return i.approved_qty ?? 0;
  return 0;
}

/**
 * Pozycje oczekujące, które mieszczą się w pakiecie (albo pozycja nie ma limitu dla poziomu
 * partnera) — do akcji „Zatwierdź wszystko w pakiecie”. „Inne potrzeby” zawsze ręcznie.
 */
export function inPackagePendingIds(
  items: RequestItem[],
  catalog: Pick<CatalogItem, "id" | "included_by_tier">[],
  tier: string | null,
): string[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  return items
    .filter((i) => {
      if (i.status !== "pending" || !i.catalog_item_id) return false;
      const c = byId.get(i.catalog_item_id);
      return !isOverPackage(i.qty, c ? includedFor(c, tier) : null);
    })
    .map((i) => i.id);
}

// ── Widok zbiorczy ─────────────────────────────────────────────────────────

export type PartnerRequestForSummary = {
  partnerId: string;
  partnerName: string;
  items: RequestItem[];
};

export type TotalsRow = {
  key: string;
  label: string;
  unit: string;
  approved: number;
  pending: number;
  byPartner: { partnerId: string; partnerName: string; approved: number; pending: number }[];
};

/**
 * Pozycja × suma zatwierdzonych i oczekujących ilości, z rozbiciem na partnerów. Kolejność
 * jak w katalogu (także nieaktywne, jeśli mają zgłoszenia). „Inne potrzeby”
 * nie mają ilości do zamówienia — pomijamy je w sumach (są na liście per stoisko).
 */
export function aggregateTotals(
  requests: PartnerRequestForSummary[],
  catalog: Pick<CatalogItem, "id" | "name" | "unit">[],
): TotalsRow[] {
  const rows = new Map<string, TotalsRow>();
  for (const c of catalog) rows.set(c.id, { key: c.id, label: c.name, unit: c.unit, approved: 0, pending: 0, byPartner: [] });
  for (const r of requests) {
    for (const i of r.items) {
      if (!i.catalog_item_id) continue;
      const key = i.catalog_item_id;
      let row = rows.get(key);
      if (!row) {
        row = { key, label: i.label, unit: i.unit, approved: 0, pending: 0, byPartner: [] };
        rows.set(key, row);
      }
      const a = approvedQty(i);
      const p = i.status === "pending" ? i.qty : 0;
      if (a === 0 && p === 0) continue;
      row.approved += a;
      row.pending += p;
      row.byPartner.push({ partnerId: r.partnerId, partnerName: r.partnerName, approved: a, pending: p });
    }
  }
  return [...rows.values()].filter((r) => r.approved > 0 || r.pending > 0);
}
