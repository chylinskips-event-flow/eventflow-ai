// Q&A, ankiety i oceny sesji — czysta logika (bez I/O), testowalna jednostkowo.
// I/O: src/lib/engagement.ts.

export type QuestionStatus = "pending" | "selected" | "answered" | "hidden";

export const QUESTION_MAX_LENGTH = 500;
export const FEEDBACK_COMMENT_MAX_LENGTH = 1000;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const POLL_OPTION_MAX_LENGTH = 120;
export const POLL_QUESTION_MAX_LENGTH = 300;
/** Limit pytań jednego uczestnika na sesję (ochrona przed spamem). */
export const MAX_QUESTIONS_PER_ATTENDEE = 10;

export type PollOption = { id: string; label: string };
export type PollStatus = "draft" | "open" | "closed";

export type PollOptionResult = PollOption & { votes: number; percent: number };

export function validateQuestionContent(raw: unknown): { ok: true; content: string } | { ok: false; error: string } {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return { ok: false, error: "Wpisz treść pytania." };
  if (content.length > QUESTION_MAX_LENGTH) {
    return { ok: false, error: `Pytanie może mieć najwyżej ${QUESTION_MAX_LENGTH} znaków.` };
  }
  return { ok: true, content };
}

/**
 * Kolejność pytań: „teraz omawiane” na górze, potem otwarte wg głosów (remis: starsze
 * wyżej), na końcu odpowiedziane. Ukryte należy odfiltrować przed wywołaniem (widok publiczny).
 */
export function sortQuestions<
  T extends { status: QuestionStatus; vote_count: number; created_at: string },
>(questions: T[]): T[] {
  const rank: Record<QuestionStatus, number> = { selected: 0, pending: 1, answered: 2, hidden: 3 };
  return [...questions].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.vote_count - a.vote_count ||
      a.created_at.localeCompare(b.created_at),
  );
}

/** Opcje ankiety z jsonb — odporne na złe dane (pomija niepoprawne wpisy). */
export function parsePollOptions(raw: unknown): PollOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (o): o is PollOption =>
        !!o && typeof o === "object" &&
        typeof (o as PollOption).id === "string" &&
        typeof (o as PollOption).label === "string",
    )
    .map((o) => ({ id: o.id, label: o.label }));
}

/** Buduje opcje ankiety z etykiet; `makeId` wstrzykiwany (testy). */
export function buildPollOptions(
  labels: unknown[],
  makeId: () => string,
): { ok: true; options: PollOption[] } | { ok: false; error: string } {
  const cleaned = labels
    .map((l) => (typeof l === "string" ? l.trim() : ""))
    .filter(Boolean);
  if (cleaned.length < POLL_MIN_OPTIONS) {
    return { ok: false, error: `Podaj co najmniej ${POLL_MIN_OPTIONS} odpowiedzi.` };
  }
  if (cleaned.length > POLL_MAX_OPTIONS) {
    return { ok: false, error: `Ankieta może mieć najwyżej ${POLL_MAX_OPTIONS} odpowiedzi.` };
  }
  if (cleaned.some((l) => l.length > POLL_OPTION_MAX_LENGTH)) {
    return { ok: false, error: `Odpowiedź może mieć najwyżej ${POLL_OPTION_MAX_LENGTH} znaków.` };
  }
  if (new Set(cleaned.map((l) => l.toLowerCase())).size !== cleaned.length) {
    return { ok: false, error: "Odpowiedzi nie mogą się powtarzać." };
  }
  return { ok: true, options: cleaned.map((label) => ({ id: makeId(), label })) };
}

/** Wyniki ankiety: głosy i procent (zaokrąglone, suma ≈ 100). */
export function pollResults(
  options: PollOption[],
  counts: Record<string, number>,
): { results: PollOptionResult[]; total: number } {
  const total = options.reduce((sum, o) => sum + (counts[o.id] ?? 0), 0);
  const results = options.map((o) => {
    const votes = counts[o.id] ?? 0;
    return { ...o, votes, percent: total > 0 ? Math.round((votes / total) * 100) : 0 };
  });
  return { results, total };
}

export type RatingSummary = {
  count: number;
  average: number | null;
  /** distribution[0] = liczba ocen 1, …, distribution[4] = liczba ocen 5 */
  distribution: [number, number, number, number, number];
};

export function ratingSummary(ratings: number[]): RatingSummary {
  const distribution: RatingSummary["distribution"] = [0, 0, 0, 0, 0];
  let sum = 0;
  let count = 0;
  for (const r of ratings) {
    if (Number.isInteger(r) && r >= 1 && r <= 5) {
      distribution[r - 1]++;
      sum += r;
      count++;
    }
  }
  return {
    count,
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    distribution,
  };
}

export type EventStatus = "draft" | "published" | "live" | "completed" | "archived";

/** Pytania można zadawać przed i w trakcie eventu (pytania „z wyprzedzeniem” też się przydają). */
export function canAskQuestions(eventStatus: EventStatus): boolean {
  return eventStatus === "published" || eventStatus === "live";
}

/**
 * Ocena możliwa, gdy sesja już się zaczęła (albo event się zakończył).
 * Sesja bez godziny — ocena dostępna od startu eventu (status live/completed).
 */
export function canRateSession(
  session: { starts_at: string | null },
  eventStatus: EventStatus,
  now: Date,
): boolean {
  if (eventStatus === "completed") return true;
  if (eventStatus !== "live" && eventStatus !== "published") return false;
  if (!session.starts_at) return eventStatus === "live";
  return new Date(session.starts_at).getTime() <= now.getTime();
}

/** Nazwa autora w widoku publicznym (anonimowe → null). */
export function publicAuthorName(
  isAnonymous: boolean,
  attendee: { first_name: string | null; last_name: string | null; company: string | null } | null,
): string | null {
  if (isAnonymous || !attendee) return null;
  const name = [attendee.first_name, attendee.last_name?.charAt(0) ? `${attendee.last_name.charAt(0)}.` : null]
    .filter(Boolean)
    .join(" ");
  return [name || null, attendee.company].filter(Boolean).join(" · ") || null;
}
