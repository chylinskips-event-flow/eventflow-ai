// Godziny sesji ZAWSZE w strefie eventu, nie w strefie serwera (na Vercelu:
// UTC -> przesunięcie o kilka godzin) ani przeglądarki uczestnika. Sesja o
// 14:00 w Warszawie to 14:00 niezależnie skąd patrzysz. Formattery cache'owane
// po stronie, bo Intl.DateTimeFormat jest kosztowny w tworzeniu. Brak strefy
// (event bez timezone) -> fallback do strefy runtime'u.
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimeFormatter(timeZone?: string | null): Intl.DateTimeFormat {
  const key = timeZone ?? "__runtime__";
  let formatter = timeFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("pl-PL", {
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    });
    timeFormatterCache.set(key, formatter);
  }
  return formatter;
}

export function getCurrentTimestamp() {
  return Date.now();
}

export function formatTime(
  value: string | null,
  timeZone?: string | null,
): string | null {
  if (!value) return null;
  return getTimeFormatter(timeZone).format(new Date(value));
}

export function formatTimeRange(
  startsAt: string | null,
  endsAt: string | null,
  timeZone?: string | null,
) {
  if (!startsAt) return null;
  const formatter = getTimeFormatter(timeZone);
  const start = formatter.format(new Date(startsAt));
  if (!endsAt) return start;
  return `${start} – ${formatter.format(new Date(endsAt))}`;
}

// Ten sam problem strefy co przy godzinach dotyczy dat: nagłówki dni,
// grupowanie po dniu i data w hero muszą liczyć się w strefie eventu, inaczej
// sesja tuż przed/po północy trafia do złego dnia (runtime UTC na Vercelu).

function buildFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale = "pl-PL",
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone ?? "__runtime__"}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      ...options,
      ...(timeZone ? { timeZone } : {}),
    });
    cache.set(key, formatter);
  }
  return formatter;
}

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateKeyFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

// Nagłówek dnia, np. "wtorek, 15 lipca".
export function formatDay(
  value: string | null,
  timeZone?: string | null,
): string | null {
  if (!value) return null;
  return buildFormatter(dayFormatterCache, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

// Stabilny klucz grupowania po dniu w strefie eventu (YYYY-MM-DD dzięki en-CA).
export function getDateGroupKey(
  value: string | null,
  timeZone?: string | null,
): string {
  if (!value) return "no-date";
  return buildFormatter(
    dateKeyFormatterCache,
    timeZone,
    { year: "numeric", month: "2-digit", day: "2-digit" },
    "en-CA",
  ).format(new Date(value));
}

// Sama data, np. "15 lipca 2026" (strona rejestracji — bez godziny).
export function formatDate(
  value: string | null,
  timeZone?: string | null,
): string | null {
  if (!value) return null;
  return buildFormatter(dateFormatterCache, timeZone, {
    dateStyle: "long",
  }).format(new Date(value));
}

// Data + godzina, np. "15 lip 2026, 14:00" (hero publicznej strony).
export function formatDateTime(
  value: string | null,
  timeZone?: string | null,
): string | null {
  if (!value) return null;
  return buildFormatter(dateTimeFormatterCache, timeZone, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
