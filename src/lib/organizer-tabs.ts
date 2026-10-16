// Zakładki ekranów panelu organizatora — czysta logika (client-safe, testowalna).
import type { TabBarItem, TabMark } from "@/components/tab-bar";

// ── Ustawienia wydarzenia ──────────────────────────────────────────────────

export const SETTINGS_TABS = [
  { key: "ogolne", label: "Ogólne" },
  { key: "branding", label: "Branding" },
  { key: "identyfikatory", label: "Identyfikatory" },
  { key: "strefa-niebezpieczna", label: "Strefa niebezpieczna" },
] as const satisfies readonly TabBarItem[];

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];
export const SETTINGS_DEFAULT_TAB: SettingsTabKey = "ogolne";
export const SETTINGS_TAB_KEYS = SETTINGS_TABS.map((t) => t.key) as SettingsTabKey[];

// ── Partner (szczegóły) ────────────────────────────────────────────────────

export type PartnerDetailTabKey = "wizytowka" | "materialy" | "stoisko" | "leady" | "kontakt" | "dostep";

export type PartnerDetailState = {
  /** Zmiany wizytówki czekają na decyzję organizatora. */
  draftPending: boolean;
  pendingMaterials: number;
  /** null = dane logistyki nie wczytały się (zakładka widoczna z komunikatem, bez znacznika). */
  pendingBoothItems: number | null;
  /** Faza B: null = funkcja wyłączona (flaga / bramka prawna) — zakładki „Leady” nie ma. */
  leads: null | { pendingQuestions: number };
};

const toReview = (n: number): TabMark | null =>
  n > 0 ? { symbol: "●", label: `do akceptacji: ${n}`, className: "text-amber-600 dark:text-amber-400" } : null;

/**
 * Zakładki szczegółów partnera: Wizytówka · Materiały · Stoisko · (Leady) · Kontakt · Dostęp.
 * Znacznik ● przy zakładkach z czymś do akceptacji; domyślna = pierwsza taka, inaczej Wizytówka.
 */
export function partnerDetailTabs(s: PartnerDetailState): {
  tabs: TabBarItem<PartnerDetailTabKey>[];
  defaultTab: PartnerDetailTabKey;
} {
  const tabs: TabBarItem<PartnerDetailTabKey>[] = [
    { key: "wizytowka", label: "Wizytówka", mark: toReview(s.draftPending ? 1 : 0) },
    { key: "materialy", label: "Materiały", mark: toReview(s.pendingMaterials) },
    { key: "stoisko", label: "Stoisko", mark: toReview(s.pendingBoothItems ?? 0) },
  ];
  if (s.leads) tabs.push({ key: "leady", label: "Leady", mark: toReview(s.leads.pendingQuestions) });
  tabs.push({ key: "kontakt", label: "Kontakt" }, { key: "dostep", label: "Dostęp" });
  const defaultTab = tabs.find((t) => t.mark)?.key ?? "wizytowka";
  return { tabs, defaultTab };
}
