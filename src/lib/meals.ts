import { createAdminClient } from "@/lib/supabase/admin";
import { toExcelCsv } from "@/lib/csv";
import {
  MEAL_NAME_MAX,
  type Meal,
  type MealActionResult,
  type MealAttendee,
  type MealSummary,
} from "@/lib/meals-shared";
import type { CheckInResult } from "@/lib/reception";

export type { MealActionResult } from "@/lib/meals-shared";

const UNIQUE_VIOLATION = "23505";

type RedeemedBy = "organizer" | "staff";

const fullName = (a: { first_name: string | null; last_name: string | null }) =>
  [a.first_name, a.last_name].filter(Boolean).join(" ") || "Uczestnik";

// ─── Odczyt ──────────────────────────────────────────────────────────────────

export async function getEventMeals(eventId: string): Promise<MealSummary[]> {
  const { data } = await createAdminClient()
    .from("event_meals")
    .select("id, event_id, name, access_token, meal_redemptions(count)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  return (data ?? []).map(({ meal_redemptions, ...meal }) => ({
    ...meal,
    redeemed: meal_redemptions[0]?.count ?? 0,
  }));
}

/** Posiłek tego wydarzenia; wywołujący sprawdził już dostęp do wydarzenia. */
export async function getEventMeal(eventId: string, mealId: string): Promise<Meal | null> {
  const { data } = await createAdminClient()
    .from("event_meals")
    .select("id, event_id, name, access_token")
    .eq("id", mealId)
    .eq("event_id", eventId)
    .maybeSingle();
  return data ?? null;
}

/** Link obsługi: posiłek razem z wydarzeniem albo null, gdy link wyłączony lub nieznany. */
export async function getMealByToken(
  token: string,
): Promise<{ meal: Meal; event: { id: string; slug: string; name: string } } | null> {
  const db = createAdminClient();
  const { data: meal } = await db
    .from("event_meals")
    .select("id, event_id, name, access_token")
    .eq("access_token", token)
    .maybeSingle();
  if (!meal) return null;
  const { data: event } = await db
    .from("events")
    .select("id, slug, name")
    .eq("id", meal.event_id)
    .maybeSingle();
  return event ? { meal, event } : null;
}

/** Zatwierdzeni uczestnicy z godziną wydania; tylko pola potrzebne obsłudze. */
export async function getMealAttendees(meal: Meal): Promise<MealAttendee[]> {
  const db = createAdminClient();
  const [{ data: attendees }, { data: redemptions }] = await Promise.all([
    db
      .from("attendees")
      .select("id, first_name, last_name, company")
      .eq("event_id", meal.event_id)
      .eq("status", "approved")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    db.from("meal_redemptions").select("attendee_id, redeemed_at").eq("meal_id", meal.id),
  ]);
  const redeemedAt = new Map((redemptions ?? []).map((r) => [r.attendee_id, r.redeemed_at]));
  return (attendees ?? []).map((a) => ({ ...a, redeemed_at: redeemedAt.get(a.id) ?? null }));
}

// ─── Wydawanie ───────────────────────────────────────────────────────────────

async function redeem(
  meal: Meal,
  column: "check_in_token" | "id",
  value: string,
  source: RedeemedBy,
): Promise<CheckInResult> {
  const db = createAdminClient();
  const { data: attendee } = await db
    .from("attendees")
    .select("id, first_name, last_name, status")
    .eq("event_id", meal.event_id)
    .eq(column, value)
    .maybeSingle();

  if (!attendee) return { ok: false, error: "not_found" };
  if (attendee.status !== "approved") return { ok: false, error: "not_approved" };

  const name = fullName(attendee);
  const { error } = await db
    .from("meal_redemptions")
    .insert({ meal_id: meal.id, attendee_id: attendee.id, redeemed_by: source });
  if (!error) return { ok: true, name, alreadyCheckedIn: false };
  if (error.code !== UNIQUE_VIOLATION) throw new Error("Nie udało się zapisać wydania posiłku.");

  const { data: existing } = await db
    .from("meal_redemptions")
    .select("redeemed_at")
    .eq("meal_id", meal.id)
    .eq("attendee_id", attendee.id)
    .maybeSingle();
  return { ok: true, name, alreadyCheckedIn: true, checkedInAt: existing?.redeemed_at ?? "" };
}

export function redeemByQr(meal: Meal, checkInToken: string, source: RedeemedBy) {
  return redeem(meal, "check_in_token", checkInToken, source);
}

export function redeemById(meal: Meal, attendeeId: string, source: RedeemedBy) {
  return redeem(meal, "id", attendeeId, source);
}

export async function undoRedemption(meal: Meal, attendeeId: string): Promise<void> {
  await createAdminClient()
    .from("meal_redemptions")
    .delete()
    .eq("meal_id", meal.id)
    .eq("attendee_id", attendeeId);
}

// ─── Zarządzanie (tylko organizator) ─────────────────────────────────────────

export async function createMeal(eventId: string, rawName: string): Promise<MealActionResult> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: "Podaj nazwę posiłku." };
  if (name.length > MEAL_NAME_MAX) {
    return { ok: false, error: `Nazwa może mieć najwyżej ${MEAL_NAME_MAX} znaków.` };
  }
  const { error } = await createAdminClient().from("event_meals").insert({ event_id: eventId, name });
  return error ? { ok: false, error: "Nie udało się dodać posiłku." } : { ok: true };
}

/** Usuwa tylko posiłek bez wydań: wydane posiłki to podstawa rozliczenia z lokalem. */
export async function deleteMeal(meal: Meal): Promise<MealActionResult> {
  const db = createAdminClient();
  const { count } = await db
    .from("meal_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("meal_id", meal.id);
  if (count !== 0) return { ok: false, error: "Nie można usunąć posiłku, który ma już wydania." };
  const { error } = await db.from("event_meals").delete().eq("id", meal.id);
  return error ? { ok: false, error: "Nie udało się usunąć posiłku." } : { ok: true };
}

export async function setMealToken(meal: Meal, token: string | null): Promise<void> {
  await createAdminClient().from("event_meals").update({ access_token: token }).eq("id", meal.id);
}

// ─── Rozliczenie z lokalem ───────────────────────────────────────────────────

type ReportRow = {
  redeemed_at: string;
  attendee: { first_name: string | null; last_name: string | null; company: string | null } | null;
};

/** CSV wydań w kolejności czasu; osoba usunięta z systemu zostaje jako wiersz bez danych. */
export async function getMealReportCsv(meal: Meal, timeZone: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("meal_redemptions")
    .select("redeemed_at, attendee:attendees(first_name, last_name, company)")
    .eq("meal_id", meal.id)
    .order("redeemed_at", { ascending: true });
  const rows = (data ?? []) as unknown as ReportRow[];
  const time = new Intl.DateTimeFormat("pl-PL", { timeZone, dateStyle: "short", timeStyle: "short" });
  return toExcelCsv(
    ["Lp.", "Imię i nazwisko", "Firma", "Godzina wydania"],
    rows.map((r, i) => [
      i + 1,
      r.attendee ? fullName(r.attendee) : "Dane usunięte",
      r.attendee?.company ?? "",
      time.format(new Date(r.redeemed_at)),
    ]),
  );
}
