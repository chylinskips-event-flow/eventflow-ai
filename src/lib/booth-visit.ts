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
