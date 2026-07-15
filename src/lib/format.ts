const timeFormatter = new Intl.DateTimeFormat("pl-PL", { timeStyle: "short" });

export function getCurrentTimestamp() {
  return Date.now();
}

export function formatTime(value: string | null): string | null {
  if (!value) return null;
  return timeFormatter.format(new Date(value));
}

export function formatTimeRange(
  startsAt: string | null,
  endsAt: string | null,
) {
  if (!startsAt) return null;
  const start = timeFormatter.format(new Date(startsAt));
  if (!endsAt) return start;
  return `${start} – ${timeFormatter.format(new Date(endsAt))}`;
}

/**
 * Jedyne źródło prawdy dla "czy sesja trwa teraz". Czyste porównanie
 * absolutnego czasu (epoch ms) — strefa czasowa eventu NIE ma tu znaczenia,
 * liczy się tylko przy wyświetlaniu. Reużywane w agendzie i w sekcji live na
 * ekranie głównym, żeby oba miejsca nigdy się nie rozjechały.
 */
export function isSessionOngoing(
  session: { starts_at: string | null; ends_at: string | null },
  now: number = getCurrentTimestamp(),
): boolean {
  if (!session.starts_at || !session.ends_at) return false;
  const start = new Date(session.starts_at).getTime();
  const end = new Date(session.ends_at).getTime();
  return now >= start && now <= end;
}
