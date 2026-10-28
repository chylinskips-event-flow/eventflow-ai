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

// ── Uczestnicy ─────────────────────────────────────────────────────────────

export type AttendeeTabKey = "wszyscy" | "oczekujacy" | "zatwierdzeni" | "odrzuceni";
export const ATTENDEE_TAB_KEYS: AttendeeTabKey[] = ["wszyscy", "oczekujacy", "zatwierdzeni", "odrzuceni"];

/** Zakładka → filtr statusu (null = wszyscy). */
export const ATTENDEE_TAB_STATUS: Record<AttendeeTabKey, "pending" | "approved" | "rejected" | null> = {
  wszyscy: null,
  oczekujacy: "pending",
  zatwierdzeni: "approved",
  odrzuceni: "rejected",
};

/**
 * Zakładki listy uczestników (filtr statusu) z licznikami; ● przy „Oczekujący”, gdy ktoś czeka.
 * Domyślna jak dotąd: „Oczekujący”, jeśli są zgłoszenia do decyzji, inaczej „Wszyscy”.
 */
export function attendeeTabs(counts: { pending: number; approved: number; rejected: number }): {
  tabs: TabBarItem<AttendeeTabKey>[];
  defaultTab: AttendeeTabKey;
} {
  const total = counts.pending + counts.approved + counts.rejected;
  return {
    tabs: [
      { key: "wszyscy", label: `Wszyscy (${total})` },
      { key: "oczekujacy", label: `Oczekujący (${counts.pending})`, mark: toReview(counts.pending) },
      { key: "zatwierdzeni", label: `Zatwierdzeni (${counts.approved})` },
      { key: "odrzuceni", label: `Odrzuceni (${counts.rejected})` },
    ],
    defaultTab: counts.pending > 0 ? "oczekujacy" : "wszyscy",
  };
}

// ── Ekrany z podekranami (wspólna rama + zakładki w `?tab=`) ────────────────

/** Business Mixer — szczegóły. „Plan” widoczny zawsze, w szkicu nieaktywny (nie ma jeszcze planu). */
export type MixerTabKey = "uczestnicy" | "parametry" | "plan";
export const MIXER_DEFAULT_TAB: MixerTabKey = "uczestnicy";

export function mixerTabs(s: { status: string; activeCount: number }): TabBarItem<MixerTabKey>[] {
  const draft = s.status === "draft";
  return [
    { key: "uczestnicy", label: `Uczestnicy (${s.activeCount})` },
    { key: "parametry", label: "Parametry" },
    {
      key: "plan",
      label: "Plan",
      disabled: draft,
      title: draft ? "Plan będzie dostępny po wygenerowaniu" : undefined,
    },
  ];
}

/** Klucze, które można otworzyć z `?tab=` (bez nieaktywnych). */
export const enabledTabKeys = <K extends string>(tabs: TabBarItem<K>[]): K[] =>
  tabs.filter((t) => !t.disabled).map((t) => t.key);

/** Q&A i ankiety — szczegóły sesji. */
export type EngagementTabKey = "ankiety" | "pytania" | "oceny";
export const ENGAGEMENT_DEFAULT_TAB: EngagementTabKey = "ankiety";
export const ENGAGEMENT_TAB_KEYS: EngagementTabKey[] = ["ankiety", "pytania", "oceny"];

export function engagementTabs(s: { visibleQuestions: number }): TabBarItem<EngagementTabKey>[] {
  return [
    { key: "ankiety", label: "Ankiety" },
    { key: "pytania", label: `Pytania (${s.visibleQuestions})` },
    { key: "oceny", label: "Oceny sesji" },
  ];
}

export const TICKETS_TABS = [
  { key: "typy", label: "Typy biletów" },
  { key: "kody", label: "Kody rabatowe" },
] as const satisfies readonly TabBarItem[];
export type TicketsTabKey = (typeof TICKETS_TABS)[number]["key"];
export const TICKETS_DEFAULT_TAB: TicketsTabKey = "typy";
export const TICKETS_TAB_KEYS = TICKETS_TABS.map((t) => t.key) as TicketsTabKey[];

export const MODERATOR_TABS = [
  { key: "linki", label: "Linki dla prowadzących" },
  { key: "komunikaty", label: "Komunikaty do ogłoszenia" },
  { key: "scenariusz", label: "Scenariusz i notatki" },
] as const satisfies readonly TabBarItem[];
export type ModeratorTabKey = (typeof MODERATOR_TABS)[number]["key"];
export const MODERATOR_DEFAULT_TAB: ModeratorTabKey = "linki";
export const MODERATOR_TAB_KEYS = MODERATOR_TABS.map((t) => t.key) as ModeratorTabKey[];

export const CONTENT_TABS = [
  { key: "opis", label: "Sekcje opisu" },
  { key: "strona", label: "Sekcje strony" },
] as const satisfies readonly TabBarItem[];
export type ContentTabKey = (typeof CONTENT_TABS)[number]["key"];
export const CONTENT_DEFAULT_TAB: ContentTabKey = "opis";
export const CONTENT_TAB_KEYS = CONTENT_TABS.map((t) => t.key) as ContentTabKey[];

export const LOGISTICS_TABS = [
  { key: "zestawienie", label: "Zestawienie" },
  { key: "stoiska", label: "Stoiska" },
  { key: "ustawienia", label: "Terminy i katalog" },
] as const satisfies readonly TabBarItem[];
export type LogisticsTabKey = (typeof LOGISTICS_TABS)[number]["key"];
export const LOGISTICS_DEFAULT_TAB: LogisticsTabKey = "zestawienie";
export const LOGISTICS_TAB_KEYS = LOGISTICS_TABS.map((t) => t.key) as LogisticsTabKey[];
