// Typy i stałe posiłków bezpieczne dla komponentów klienckich (bez klienta service_role).

export const MEAL_NAME_MAX = 80;

export type Meal = {
  id: string;
  event_id: string;
  name: string;
  access_token: string | null;
};

export type MealSummary = Meal & { redeemed: number };

export type MealAttendee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  redeemed_at: string | null;
};

export type MealActionResult = { ok: true } | { ok: false; error: string };
