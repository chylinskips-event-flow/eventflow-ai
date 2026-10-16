// #10 Faza A2 — zapotrzebowanie partnera na stoisko: czysta logika (bez I/O), testowalna
// jednostkowo i bezpieczna dla klienta. I/O: src/lib/booth-requests.ts.

import { PARTNER_TIERS } from "@/lib/partner-options";
import { formatDateTime, formatDateTimeRange, toDateTimeLocalValue } from "@/lib/format";

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

/** Okno montażu / demontażu w strefie wydarzenia: dzień + zakres godzin. */
export type TimeWindow = { date: string; from: string; to: string };
/** Wybór partnera w obrębie okna (strefa wydarzenia). */
export type TimeSlot = TimeWindow;

export const SLOT_STEPS = [15, 30, 60] as const;
export type SlotStep = (typeof SLOT_STEPS)[number];
export const DEFAULT_SLOT_STEP: SlotStep = 30;
export const MAX_WINDOWS = 10;
export const TIME_NOTE_MAX_LENGTH = 200;
export const PLATE_MAX_LENGTH = 15;

export type LogisticsSettings = {
  request_deadline: string | null;
  setup_windows: TimeWindow[];
  teardown_windows: TimeWindow[];
  slot_step_minutes: SlotStep;
  require_vehicle_plate: boolean;
};

export const EMPTY_SETTINGS: LogisticsSettings = {
  request_deadline: null,
  setup_windows: [],
  teardown_windows: [],
  slot_step_minutes: DEFAULT_SLOT_STEP,
  require_vehicle_plate: false,
};

export const VEHICLE_TYPES = [
  { value: "car", label: "Osobowy" },
  { value: "van", label: "Dostawczy" },
  { value: "truck", label: "Ciężarowy" },
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number]["value"];

export function vehicleTypeLabel(v: string | null): string | null {
  return VEHICLE_TYPES.find((t) => t.value === v)?.label ?? null;
}

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
  /** Orientacyjne godziny, gdy organizator nie ustawił okna. */
  setup_note: string | null;
  teardown_note: string | null;
  vehicle: boolean;
  vehicle_note: string | null;
  vehicle_plate: string | null;
  vehicle_type: VehicleType | null;
};

export type BoothRequest = BoothRequestInfo & {
  id: string;
  partner_id: string;
  submitted_at: string;
  late_change_at: string | null;
  /** Godziny poza oknem po zmianie okien przez organizatora — partner musi je poprawić. */
  times_need_fix: boolean;
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

// ── Okna montażu / demontażu ───────────────────────────────────────────────

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

const byStart = (a: TimeWindow, b: TimeWindow) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from);

function isWindow(w: unknown): w is TimeWindow {
  if (!w || typeof w !== "object") return false;
  const { date, from, to } = w as Record<string, unknown>;
  return (
    typeof date === "string" &&
    typeof from === "string" &&
    typeof to === "string" &&
    DATE.test(date) &&
    TIME.test(from) &&
    TIME.test(to) &&
    toMinutes(from) < toMinutes(to)
  );
}

/** jsonb z bazy → poprawne okna, posortowane (śmieci pomijane). */
export function parseWindows(raw: unknown): TimeWindow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isWindow).map(({ date, from, to }) => ({ date, from, to })).sort(byStart);
}

export function parseSlotStep(raw: unknown): SlotStep {
  const n = Number(raw);
  return (SLOT_STEPS as readonly number[]).includes(n) ? (n as SlotStep) : DEFAULT_SLOT_STEP;
}

/**
 * Okna z formularza organizatora: równoległe listy `<prefix>_date`, `<prefix>_from`, `<prefix>_to`.
 * Całkiem pusty wiersz jest pomijany; częściowo wypełniony to błąd.
 */
export function readWindows(
  getAll: (key: string) => FormDataEntryValue[],
  prefix: "setup" | "teardown",
  label: string,
): { ok: true; value: TimeWindow[] } | { ok: false; error: string } {
  const s = (v: FormDataEntryValue | undefined) => (typeof v === "string" ? v.trim() : "");
  const dates = getAll(`${prefix}_date`);
  const froms = getAll(`${prefix}_from`);
  const tos = getAll(`${prefix}_to`);
  const out: TimeWindow[] = [];
  for (let i = 0; i < Math.max(dates.length, froms.length, tos.length); i++) {
    const w = { date: s(dates[i]), from: s(froms[i]), to: s(tos[i]) };
    if (!w.date && !w.from && !w.to) continue;
    if (!DATE.test(w.date) || !TIME.test(w.from) || !TIME.test(w.to)) {
      return { ok: false, error: `${label}: uzupełnij dzień oraz godzinę od i do w każdym oknie.` };
    }
    if (toMinutes(w.from) >= toMinutes(w.to)) return { ok: false, error: `${label}: godzina „od” musi być przed „do”.` };
    out.push(w);
  }
  if (out.length > MAX_WINDOWS) return { ok: false, error: `${label}: najwyżej ${MAX_WINDOWS} okien.` };
  return { ok: true, value: out.sort(byStart) };
}

/** Godziny do wyboru w oknie: od początku co `step` minut, zawsze z końcem okna. */
export function slotTimes(w: Pick<TimeWindow, "from" | "to">, step: number): string[] {
  const start = toMinutes(w.from);
  const end = toMinutes(w.to);
  const out: string[] = [];
  for (let m = start; m < end; m += step) out.push(fromMinutes(m));
  out.push(w.to);
  return out;
}

/** Czy przedział mieści się w którymś oknie (bez sprawdzania kroku) — do oznaczania „do poprawy”. */
export function slotWithinWindows(slot: TimeSlot, windows: TimeWindow[]): boolean {
  const [f, t] = [toMinutes(slot.from), toMinutes(slot.to)];
  return windows.some((w) => w.date === slot.date && f >= toMinutes(w.from) && t <= toMinutes(w.to));
}

/** Wybór partnera: w oknie, początek przed końcem, obie godziny z siatki kroku tego okna. */
export function slotFits(slot: TimeSlot, windows: TimeWindow[], step: number): boolean {
  if (!DATE.test(slot.date) || !TIME.test(slot.from) || !TIME.test(slot.to)) return false;
  if (toMinutes(slot.from) >= toMinutes(slot.to)) return false;
  return windows.some((w) => {
    if (w.date !== slot.date) return false;
    const allowed = new Set(slotTimes(w, step));
    return allowed.has(slot.from) && allowed.has(slot.to);
  });
}

/** Zapisany wybór (timestamptz) → dzień i godziny w strefie wydarzenia; null, gdy koniec innego dnia. */
export function toLocalSlot(start: string | null, end: string | null, timeZone: string | null): TimeSlot | null {
  if (!start || !end) return null;
  const [sd, st] = toDateTimeLocalValue(start, timeZone).split("T");
  const [ed, et] = toDateTimeLocalValue(end, timeZone).split("T");
  if (sd !== ed) return null;
  return { date: sd, from: st, to: et };
}

const DAY_FMT = new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

/** „pon., 17 listopada” — dzień okna (data bez strefy). */
export function windowDayLabel(date: string): string {
  return DAY_FMT.format(new Date(`${date}T00:00:00Z`));
}

export function windowLabel(w: TimeWindow): string {
  return `${windowDayLabel(w.date)}, ${w.from}–${w.to}`;
}

export function windowsLabel(windows: TimeWindow[]): string | null {
  return windows.length ? windows.map(windowLabel).join("; ") : null;
}

/** Godziny montażu/demontażu do wyświetlenia (strefa wydarzenia) albo orientacyjny opis partnera. */
export function requestTimesLabel(
  start: string | null,
  end: string | null,
  note: string | null,
  timeZone: string | null,
): string | null {
  const slot = toLocalSlot(start, end, timeZone);
  if (slot) return windowLabel(slot);
  const range = logisticsRangeLabel(start, end, timeZone);
  if (range) return range;
  return note ? `orientacyjnie: ${note}` : null;
}

// ── Pojazd ─────────────────────────────────────────────────────────────────

/** „Tak — dostawczy, WX 12345 — uwaga” / „Nie” (widoki organizatora i partnera). */
export function vehicleLabel(
  r: Pick<BoothRequestInfo, "vehicle" | "vehicle_type" | "vehicle_plate" | "vehicle_note">,
): string {
  if (!r.vehicle) return "Nie";
  const what = [vehicleTypeLabel(r.vehicle_type)?.toLowerCase(), r.vehicle_plate].filter(Boolean).join(", ");
  return ["Tak", what, r.vehicle_note].filter(Boolean).join(" — ");
}

/** Numer rejestracyjny: wielkie litery, pojedyncze spacje; null gdy pusty, "invalid" gdy zły. */
export function normalizePlate(raw: string): string | null | "invalid" {
  const v = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!v) return null;
  return v.length <= PLATE_MAX_LENGTH && /^[A-Z0-9][A-Z0-9 -]*$/.test(v) ? v : "invalid";
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
 * Dane o stoisku. Godziny wybrane z okien sprawdza akcja (slotFits) — tu limity pól
 * i wymóg numeru rejestracyjnego ustawiany przez organizatora.
 */
export function validateRequestInfo(info: BoothRequestInfo, settings: LogisticsSettings): string | null {
  if (info.crew_count !== null && (!Number.isInteger(info.crew_count) || info.crew_count < 0 || info.crew_count > CREW_MAX)) {
    return `Liczba osób obsługi: od 0 do ${CREW_MAX}.`;
  }
  if (info.vehicle_note && info.vehicle_note.length > VEHICLE_NOTE_MAX_LENGTH) {
    return `Uwaga o rozładunku może mieć najwyżej ${VEHICLE_NOTE_MAX_LENGTH} znaków.`;
  }
  for (const [label, note] of [["Montaż", info.setup_note], ["Demontaż", info.teardown_note]] as const) {
    if (note && note.length > TIME_NOTE_MAX_LENGTH) return `${label}: opis godzin może mieć najwyżej ${TIME_NOTE_MAX_LENGTH} znaków.`;
  }
  if (info.vehicle && settings.require_vehicle_plate && !info.vehicle_plate) {
    return "Podaj numer rejestracyjny pojazdu — organizator wymaga go przy rozładunku.";
  }
  return null;
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
