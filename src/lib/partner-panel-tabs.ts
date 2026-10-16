// Panel partnera w zakładkach — czysta logika (bez I/O, bez Reacta), testowalna i client-safe:
// które zakładki są widoczne, ich stan (✓ / ● / ⏳), pasek postępu, karty „Co dalej?”.

export const TAB_KEYS = ["przeglad", "wizytowka", "materialy", "stoisko", "leady", "kontakt"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const TAB_LABELS: Record<TabKey, string> = {
  przeglad: "Co dalej?",
  wizytowka: "Wizytówka",
  materialy: "Materiały",
  stoisko: "Stoisko",
  leady: "Leady",
  kontakt: "Kontakt",
};

export const DEFAULT_TAB: TabKey = "przeglad";

/** done ✓ gotowe · todo ● do uzupełnienia · waiting ⏳ czeka na organizatora · null bez znacznika. */
export type TabStatus = "done" | "todo" | "waiting" | null;

export const TAB_STATUS_MARK: Record<Exclude<TabStatus, null>, { mark: string; label: string }> = {
  done: { mark: "✓", label: "gotowe" },
  todo: { mark: "●", label: "do uzupełnienia" },
  waiting: { mark: "⏳", label: "czeka na akceptację organizatora" },
};

/** Stan danych potrzebny do zakładek — liczony na serwerze z tego, co panel i tak wczytuje. */
export type PanelState = {
  profile: { draftStatus: "pending" | "rejected" | null; hasLogo: boolean; hasDescription: boolean };
  materials: ("pending" | "approved" | "rejected")[];
  /** null = sekcja stoiska niedostępna (zakładka ukryta); loadError = nie wczytała się (zakładka widoczna, bez znacznika). */
  booth: null | {
    loadError: boolean;
    hasRequest: boolean;
    pendingItems: number;
    timesNeedFix: boolean;
    locked: boolean;
    deadlineLabel: string | null;
  };
  /**
   * Faza B (pytania i kontakty ze stoiska). null = funkcja wyłączona (flaga / bramka prawna) —
   * zakładki „Leady” nie ma, panel wygląda jak bez Fazy B. Liczby pytań do znacznika.
   */
  leads: null | { pendingQuestions: number; approvedQuestions: number };
  contact: { hasContact: boolean };
};

/**
 * „Leady” są opcjonalne (pytania nie są obowiązkowe): ⏳ gdy pytanie czeka na organizatora,
 * ✓ gdy jest zaakceptowane, bez znacznika w pozostałych przypadkach (nie liczy się do postępu).
 */
function leadsStatus(l: NonNullable<PanelState["leads"]>): TabStatus {
  if (l.pendingQuestions > 0) return "waiting";
  if (l.approvedQuestions > 0) return "done";
  return null;
}

export type TabInfo = { key: TabKey; label: string; status: TabStatus };

function profileStatus(p: PanelState["profile"]): TabStatus {
  if (p.draftStatus === "pending") return "waiting";
  if (p.draftStatus === "rejected" || !p.hasLogo || !p.hasDescription) return "todo";
  return "done";
}

function materialsStatus(m: PanelState["materials"]): TabStatus {
  if (m.length === 0) return "todo";
  if (m.includes("pending")) return "waiting";
  if (m.includes("approved")) return "done";
  return "todo";
}

function boothStatus(b: NonNullable<PanelState["booth"]>): TabStatus {
  if (b.loadError) return null;
  if (b.timesNeedFix) return "todo";
  if (b.pendingItems > 0) return "waiting";
  if (b.hasRequest) return "done";
  // Brak wniosku: do zrobienia, dopóki termin nie minął (po terminie tylko „Poproś o zmianę”).
  return b.locked ? null : "todo";
}

/** Widoczne zakładki w stałej kolejności; „Co dalej?” zawsze pierwsza i bez znacznika. */
export function computeTabs(s: PanelState): TabInfo[] {
  const tabs: TabInfo[] = [
    { key: "przeglad", label: TAB_LABELS.przeglad, status: null },
    { key: "wizytowka", label: TAB_LABELS.wizytowka, status: profileStatus(s.profile) },
    { key: "materialy", label: TAB_LABELS.materialy, status: materialsStatus(s.materials) },
  ];
  if (s.booth) tabs.push({ key: "stoisko", label: TAB_LABELS.stoisko, status: boothStatus(s.booth) });
  if (s.leads) tabs.push({ key: "leady", label: TAB_LABELS.leady, status: leadsStatus(s.leads) });
  tabs.push({ key: "kontakt", label: TAB_LABELS.kontakt, status: s.contact.hasContact ? "done" : "todo" });
  return tabs;
}

/** `?tab=` → zakładka, o ile jest widoczna; nieznana lub ukryta wartość → domyślna. */
export function resolveTab(raw: unknown, visible: Pick<TabInfo, "key">[]): TabKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && visible.some((t) => t.key === value) ? (value as TabKey) : DEFAULT_TAB;
}

/** „Uzupełnione X z Y” — tylko widoczne zakładki z zadaniem (bez „Co dalej?” i opcjonalnych „Leady”). */
export function computeProgress(tabs: TabInfo[]): { done: number; total: number } {
  const counted = tabs.filter((t) => t.key !== "przeglad" && t.key !== "leady");
  return { done: counted.filter((t) => t.status === "done").length, total: counted.length };
}

export type NextTask = { tab: TabKey; title: string; description: string };

/**
 * Karty „Co dalej?” (najwyżej `limit`): najpierw zadania z terminem lub do poprawy przy stoisku,
 * potem brakujące elementy wizytówki, materiały i kontakt.
 */
export function nextTasks(s: PanelState, limit = 2): NextTask[] {
  const out: NextTask[] = [];
  const b = s.booth;
  if (b && !b.loadError) {
    if (b.timesNeedFix) {
      out.push({
        tab: "stoisko",
        title: "Popraw godziny montażu / demontażu",
        description: "Organizator zmienił dostępne godziny — wybierz je ponownie.",
      });
    } else if (!b.hasRequest && !b.locked) {
      out.push({
        tab: "stoisko",
        title: b.deadlineLabel ? `Zgłoś zapotrzebowanie na stoisko — do ${b.deadlineLabel}` : "Zgłoś zapotrzebowanie na stoisko",
        description: "Stoły, krzesła, prąd, internet, godziny montażu i rozładunek.",
      });
    }
  }
  const p = s.profile;
  if (p.draftStatus === "rejected") {
    out.push({ tab: "wizytowka", title: "Popraw wizytówkę", description: "Organizator odrzucił ostatnie zmiany — zobacz uwagę." });
  } else if (p.draftStatus !== "pending") {
    if (!p.hasLogo) out.push({ tab: "wizytowka", title: "Dodaj logo", description: "Logo pokaże się przy Twojej firmie na stronie wydarzenia." });
    if (!p.hasDescription) out.push({ tab: "wizytowka", title: "Dodaj opis firmy", description: "Kilka zdań o tym, czym się zajmujecie." });
  }
  if (materialsStatus(s.materials) === "todo") {
    out.push({ tab: "materialy", title: "Dodaj materiały do pobrania", description: "Katalog, cennik albo case study dla uczestników." });
  }
  if (!s.contact.hasContact) {
    out.push({ tab: "kontakt", title: "Podaj osobę kontaktową", description: "Organizator będzie wiedział, z kim ustalać sprawy stoiska." });
  }
  return out.slice(0, limit);
}
