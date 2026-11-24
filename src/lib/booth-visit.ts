// Ekran po zeskanowaniu QR stoiska — czysta logika komunikatu (client-safe, testowalna).

export type VisitResultView = {
  title: string;
  /** Punkty do pokazania („+X pkt”) albo null — bez sugestii punktów i bez „0 pkt”. */
  points: number | null;
  showLevelUp: boolean;
};

/**
 * Powtórna wizyta (quest już zaliczony wcześniej): punkty nie są naliczane teraz, więc bez
 * plusa — „Punkty zaliczone: X”. Brak punktów → bez linii z punktami.
 */
export function alreadyVisitedPointsLabel(completedPoints: number | null): string | null {
  return completedPoints !== null && completedPoints > 0 ? `Punkty zaliczone: ${completedPoints}` : null;
}

/**
 * Partnerzy bez aktywnego questa stoiskowego (strona stoiska bierze aktywny quest z partner_id) —
 * ich uczestnicy po skanie QR widzą tylko „Wizyta zapisana”, bez punktów.
 */
export function partnersWithoutBoothQuest<P extends { id: string }>(
  partners: P[],
  quests: { partner_id: string | null; is_active: boolean }[],
): P[] {
  const covered = new Set(quests.filter((q) => q.is_active && q.partner_id).map((q) => q.partner_id));
  return partners.filter((p) => !covered.has(p.id));
}

/**
 * Bez questa „Odwiedziny stoiska” dla tego partnera: samo „Wizyta zapisana”.
 * Z questem: „Stoisko odwiedzone!”, punkty tylko gdy faktycznie naliczone.
 */
export function visitResultView(params: { hasQuest: boolean; pointsAwarded: number; levelUp: boolean }): VisitResultView {
  if (!params.hasQuest) return { title: "Wizyta zapisana", points: null, showLevelUp: false };
  return {
    title: "Stoisko odwiedzone!",
    points: params.pointsAwarded > 0 ? params.pointsAwarded : null,
    showLevelUp: params.levelUp,
  };
}

/**
 * Partner może mieć kilka aktywnych questów stoiskowych — każdy liczony osobno. Bieżący quest
 * to pierwszy (w kolejności utworzenia) jeszcze niezaliczony; gdy wszystkie zaliczone — pierwszy
 * (ekran „już odwiedzone”). Brak questów → null.
 */
export function pickBoothQuest<Q extends { id: string }>(
  quests: Q[],
  completedQuestIds: Iterable<string>,
): Q | null {
  if (quests.length === 0) return null;
  const done = new Set(completedQuestIds);
  return quests.find((q) => !done.has(q.id)) ?? quests[0];
}

/** Limit prób quizu / hasła stoiska i przerwa po pierwszej nieudanej próbie. */
export const MAX_QUIZ_ATTEMPTS = 2;
export const QUIZ_COOLDOWN_MS = 10 * 60 * 1000; // 10 minut

export type QuizAttemptRejection =
  | { status: "no_attempts" }
  | { status: "error"; message: string };

/**
 * Komunikat, gdy baza odmówiła zarezerwowania kolejnej próby (claim_quiz_attempt zwróciło NULL):
 * wyczerpany limit albo trwająca przerwa między próbami.
 */
export function quizAttemptRejection(
  row: { attempts: number; last_attempt_at: string | null } | null,
  now: number,
): QuizAttemptRejection {
  if (row && row.attempts >= MAX_QUIZ_ATTEMPTS) return { status: "no_attempts" };
  const lastAt = row?.last_attempt_at ? new Date(row.last_attempt_at).getTime() : now;
  // Przycięte do [0, przerwa] — zegar bazy i aplikacji mogą się nieco różnić.
  const left = Math.min(Math.max(QUIZ_COOLDOWN_MS - (now - lastAt), 0), QUIZ_COOLDOWN_MS);
  const minutesLeft = Math.max(Math.ceil(left / 60_000), 1);
  return {
    status: "error",
    message: `Porozmawiaj z zespołem stoiska i spróbuj ponownie za ${minutesLeft} min.`,
  };
}
