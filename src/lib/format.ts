const timeFormatter = new Intl.DateTimeFormat("pl-PL", { timeStyle: "short" });

export function getCurrentTimestamp() {
  return Date.now();
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
