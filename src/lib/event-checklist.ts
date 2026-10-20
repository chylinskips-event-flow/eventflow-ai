// Checklista startowa wydarzenia (panel organizatora) — czysta logika, client-safe, testowalna.
// Dane liczy serwer przy renderze strony wydarzenia (lekkie count/exists).

export type ChecklistData = {
  eventId: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  registrationOpen: boolean;
  ticketTypes: number;
  sessions: number;
  speakers: number;
  partners: number;
  /** Publiczny adres strony (buildEventApexUrl) — pokazywany przy kroku „Opublikuj”. */
  publicUrl: string;
};

export type ChecklistStepKey = "podstawy" | "wyglad" | "bilety" | "program" | "partnerzy" | "publikacja";

export type ChecklistStep = {
  key: ChecklistStepKey;
  title: string;
  description: string;
  done: boolean;
  /** Krok opcjonalny nie blokuje 100%. */
  optional: boolean;
  href: string;
  /** Dodatkowy link (np. publiczna strona po publikacji). */
  extraLink?: { href: string; label: string };
};

export type Checklist = {
  steps: ChecklistStep[];
  /** Ukończone kroki wymagane / wszystkie wymagane (opcjonalne liczone osobno). */
  done: number;
  total: number;
  complete: boolean;
};

/** Kolor z pola koloru, gdy organizator go nie zmieniał (input type=color zapisuje czarny). */
const DEFAULT_COLORS = new Set(["#000000", "#000"]);

/** Ile ukończonych kroków, by checklista była domyślnie zwinięta. */
export const COLLAPSE_AFTER_DONE = 2;

export function computeChecklist(d: ChecklistData): Checklist {
  const base = `/admin/events/${d.eventId}`;
  const customColor = !!d.primaryColor && !DEFAULT_COLORS.has(d.primaryColor.trim().toLowerCase());
  const published = d.status !== "draft";

  const steps: ChecklistStep[] = [
    {
      key: "podstawy",
      title: "Podstawy",
      description: "Data i godzina początku i końca oraz miejsce wydarzenia.",
      done: !!d.startsAt && !!d.endsAt && !!d.location?.trim(),
      optional: false,
      href: `${base}?tab=ogolne`,
    },
    {
      key: "wyglad",
      title: "Wygląd strony",
      description: "Logo lub własny kolor akcentu na stronie wydarzenia.",
      done: !!d.logoUrl || customColor,
      optional: false,
      href: `${base}?tab=branding`,
    },
    {
      key: "bilety",
      title: "Bilety / rejestracja",
      description:
        d.ticketTypes > 0
          ? "Typy biletów są gotowe."
          : d.registrationOpen
            ? "Rejestracja jest otwarta — uczestnicy zapiszą się bezpłatnie. Dodaj bilety, jeśli chcesz je sprzedawać."
            : "Dodaj typ biletu albo otwórz rejestrację.",
      done: d.ticketTypes > 0 || d.registrationOpen,
      optional: false,
      href: `${base}/tickets`,
    },
    {
      key: "program",
      title: "Program",
      description: "Co najmniej jedna pozycja agendy albo prelegent.",
      done: d.sessions > 0 || d.speakers > 0,
      optional: false,
      href: `${base}/sessions`,
    },
    {
      key: "partnerzy",
      title: "Partnerzy",
      description: "Sponsorzy i wystawcy z wizytówką i stoiskiem.",
      done: d.partners > 0,
      optional: true,
      href: `${base}/partners`,
    },
    {
      key: "publikacja",
      title: "Opublikuj",
      description: published
        ? "Strona wydarzenia jest publiczna."
        : "Opublikuj wydarzenie, żeby uczestnicy mogli wejść na stronę i się zapisać.",
      done: published,
      optional: false,
      href: `${base}?tab=ogolne`,
      extraLink: published ? { href: d.publicUrl, label: "Zobacz stronę" } : undefined,
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { steps, done, total: required.length, complete: done === required.length };
}

/** Domyślnie rozwinięta, dopóki ukończono mniej niż 2 kroki. */
export function checklistStartsExpanded(c: Checklist): boolean {
  return c.done < COLLAPSE_AFTER_DONE;
}

export const checklistHiddenKey = (eventId: string) => `eventro:checklist-hidden:${eventId}`;
