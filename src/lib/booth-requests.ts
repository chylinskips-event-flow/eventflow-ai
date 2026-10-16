// #10 Faza A2 — zapotrzebowanie partnera na stoisko: odczyty (service_role). Wywoływać
// WYŁĄCZNIE po autoryzacji: organizator (getOwnEvent + partner_portal) albo partner
// (getPartnerContext). Tabele mają RLS deny-all. Czysta logika: booth-requests-core.ts.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_BOOTH_CATALOG,
  EMPTY_SETTINGS,
  parseIncludedByTier,
  parseSlotStep,
  parseWindows,
  type BoothRequest,
  type CatalogItem,
  type LogisticsSettings,
  type RequestItem,
  type RequestStatus,
  aggregateTotals,
  requestStatus,
} from "@/lib/booth-requests-core";

type DbError = { code?: string; message: string } | null;

function logError(what: string, error: DbError) {
  if (error) console.error(`[booth-requests] ${what}`, JSON.stringify({ code: error.code, message: error.message }));
}

/**
 * Błąd odczytu danych logistyki (np. brak tabeli / kolumny po niezastosowanej migracji).
 * Nie zamieniamy go na pusty wynik — strona pokazuje „Nie udało się wczytać wniosku”,
 * żeby brak migracji był widoczny od razu, a nie wyglądał jak „Brak wniosku”.
 */
export class BoothDataError extends Error {
  constructor(what: string, error: NonNullable<DbError>) {
    super(`[booth-requests] ${what}: ${error.code ?? ""} ${error.message}`);
    this.name = "BoothDataError";
  }
}

function failOn(what: string, error: DbError) {
  if (!error) return;
  logError(what, error);
  throw new BoothDataError(what, error);
}

export const BOOTH_LOAD_ERROR =
  "Nie udało się wczytać wniosku. Odśwież stronę — jeśli błąd się powtarza, zgłoś go organizatorowi.";

/** Odczyt danych logistyki: błąd bazy → { ok: false }; inne wyjątki (np. redirect) lecą dalej. */
export async function loadBoothData<T>(load: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch (e) {
    if (e instanceof BoothDataError) return { ok: false };
    throw e;
  }
}

const SETTINGS_COLUMNS = "request_deadline, setup_windows, teardown_windows, slot_step_minutes, require_vehicle_plate";
const CATALOG_COLUMNS = "id, name, unit, description, active, sort_order, included_by_tier";
const REQUEST_COLUMNS =
  "id, partner_id, crew_count, setup_start, setup_end, teardown_start, teardown_end, setup_note, teardown_note, vehicle, vehicle_note, vehicle_plate, vehicle_type, submitted_at, late_change_at, times_need_fix";
const ITEM_COLUMNS =
  "id, request_id, catalog_item_id, label, unit, qty, note, status, approved_qty, decision_note, reviewed_at, created_at";

export async function getLogisticsSettings(eventId: string): Promise<LogisticsSettings> {
  const { data, error } = await createAdminClient()
    .from("booth_logistics_settings")
    .select(SETTINGS_COLUMNS)
    .eq("event_id", eventId)
    .maybeSingle();
  failOn("settings read failed", error);
  if (!data) return EMPTY_SETTINGS;
  return {
    request_deadline: data.request_deadline as string | null,
    setup_windows: parseWindows(data.setup_windows),
    teardown_windows: parseWindows(data.teardown_windows),
    slot_step_minutes: parseSlotStep(data.slot_step_minutes),
    require_vehicle_plate: data.require_vehicle_plate === true,
  };
}

/**
 * Domyślny katalog — wstawiany jeden raz na event. Flaga catalog_seeded przełączana
 * warunkowym UPDATE, więc przy równoległych wejściach wstawia tylko jedno żądanie.
 */
export async function ensureDefaultCatalog(eventId: string): Promise<void> {
  const admin = createAdminClient();
  const { error: upsertError } = await admin
    .from("booth_logistics_settings")
    .upsert({ event_id: eventId }, { onConflict: "event_id", ignoreDuplicates: true });
  failOn("settings init failed", upsertError);
  const { data: claimed, error } = await admin
    .from("booth_logistics_settings")
    .update({ catalog_seeded: true })
    .eq("event_id", eventId)
    .eq("catalog_seeded", false)
    .select("id");
  failOn("seed claim failed", error);
  if (!claimed?.length) return;
  const { error: insertError } = await admin.from("booth_catalog_items").insert(
    DEFAULT_BOOTH_CATALOG.map((c, i) => ({ event_id: eventId, name: c.name, unit: c.unit, sort_order: i })),
  );
  if (insertError) {
    // Zwolnij flagę, żeby następne wejście spróbowało wstawić katalog ponownie.
    await admin.from("booth_logistics_settings").update({ catalog_seeded: false }).eq("event_id", eventId);
  }
  failOn("seed insert failed", insertError);
}

export async function getCatalog(eventId: string): Promise<CatalogItem[]> {
  const { data, error } = await createAdminClient()
    .from("booth_catalog_items")
    .select(CATALOG_COLUMNS)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  failOn("catalog read failed", error);
  return ((data ?? []) as (CatalogItem & { included_by_tier: unknown })[]).map((c) => ({
    ...c,
    included_by_tier: parseIncludedByTier(c.included_by_tier),
  }));
}

type RequestRow = Omit<BoothRequest, "items">;
type ItemRow = RequestItem & { request_id: string };

function attachItems(requests: RequestRow[], items: ItemRow[]): BoothRequest[] {
  const byRequest = new Map<string, RequestItem[]>();
  for (const { request_id, ...item } of items) {
    const list = byRequest.get(request_id) ?? [];
    list.push(item);
    byRequest.set(request_id, list);
  }
  return requests.map((r) => ({ ...r, items: byRequest.get(r.id) ?? [] }));
}

export async function getBoothRequest(partnerId: string): Promise<BoothRequest | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partner_booth_requests")
    .select(REQUEST_COLUMNS)
    .eq("partner_id", partnerId)
    .maybeSingle();
  failOn("request read failed", error);
  if (!data) return null;
  const { data: items, error: itemsError } = await admin
    .from("partner_booth_request_items")
    .select(ITEM_COLUMNS)
    .eq("request_id", data.id)
    .order("created_at", { ascending: true });
  failOn("items read failed", itemsError);
  return attachItems([data as RequestRow], (items ?? []) as ItemRow[])[0];
}

/** Wszystkie wnioski eventu (widok zbiorczy, badge na kartach partnerów). */
export async function getEventBoothRequests(eventId: string): Promise<BoothRequest[]> {
  const admin = createAdminClient();
  const [requests, items] = await Promise.all([
    admin.from("partner_booth_requests").select(REQUEST_COLUMNS).eq("event_id", eventId),
    admin
      .from("partner_booth_request_items")
      .select(ITEM_COLUMNS)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
  ]);
  failOn("event requests read failed", requests.error);
  failOn("event items read failed", items.error);
  return attachItems((requests.data ?? []) as RequestRow[], (items.data ?? []) as ItemRow[]);
}

export async function getBoothRequestStatuses(eventId: string): Promise<Record<string, RequestStatus>> {
  const out: Record<string, RequestStatus> = {};
  for (const r of await getEventBoothRequests(eventId)) out[r.partner_id] = requestStatus(r.items);
  return out;
}

/** Adres organizatora do powiadomień: konto właściciela, a gdy brak — e-mail rozliczeń. */
export async function getOrganizerEmail(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("owner_user_id, billing_email")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return null;
  const { data } = await admin.auth.admin.getUserById(org.owner_user_id as string);
  return data?.user?.email ?? (org.billing_email as string | null) ?? null;
}

/** Aktywne osoby z dostępem do panelu partnera — odbiorcy decyzji organizatora. */
export async function getPartnerRecipientEmails(partnerId: string): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("partner_access")
    .select("email")
    .eq("partner_id", partnerId)
    .is("revoked_at", null)
    .not("user_id", "is", null);
  logError("recipients read failed", error);
  return [...new Set((data ?? []).map((r) => (r.email as string).toLowerCase()))];
}

export type BoothListRow = {
  partnerId: string;
  partnerName: string;
  tier: string | null;
  boothLocation: string | null;
  request: BoothRequest;
};

/** Dane widoku zbiorczego / druku / CSV — jedno źródło, żeby sumy zgadzały się z eksportem. */
export async function getLogisticsData(eventId: string) {
  const admin = createAdminClient();
  const [settings, catalog, requests, partnersRes] = await Promise.all([
    getLogisticsSettings(eventId),
    getCatalog(eventId),
    getEventBoothRequests(eventId),
    admin.from("partners").select("id, name, tier, booth_location").eq("event_id", eventId).order("name", { ascending: true }),
  ]);
  failOn("partners read failed", partnersRes.error);
  const partners = (partnersRes.data ?? []) as { id: string; name: string; tier: string | null; booth_location: string | null }[];
  const byPartner = new Map(requests.map((r) => [r.partner_id, r]));
  const booths: BoothListRow[] = partners
    .filter((p) => byPartner.has(p.id))
    .map((p) => ({
      partnerId: p.id,
      partnerName: p.name,
      tier: p.tier,
      boothLocation: p.booth_location,
      request: byPartner.get(p.id) as BoothRequest,
    }));
  const totals = aggregateTotals(
    booths.map((b) => ({ partnerId: b.partnerId, partnerName: b.partnerName, items: b.request.items })),
    catalog,
  );
  return { settings, catalog, partners, booths, totals };
}
