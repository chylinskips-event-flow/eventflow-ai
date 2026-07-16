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

/**
 * Prelegenci sesji jako jeden string: "Moderator: X · Y, Z" (gdy jest
 * moderator) albo "Y, Z". Typ strukturalny — bez importu z lib/sessions
 * (server-only), więc helper jest client-safe.
 */
export function formatSessionSpeakers(
  speakers: {
    speaker: { first_name: string | null; last_name: string | null };
    role: string;
  }[],
): string | null {
  const fullName = (entry: {
    speaker: { first_name: string | null; last_name: string | null };
  }) =>
    [entry.speaker.first_name, entry.speaker.last_name]
      .filter(Boolean)
      .join(" ");

  const moderator = speakers.find((entry) => entry.role === "moderator");
  const rest = speakers
    .filter((entry) => entry.role !== "moderator")
    .map(fullName)
    .filter(Boolean);

  if (moderator) {
    const moderatorName = fullName(moderator);
    const restLabel = rest.join(", ");
    return restLabel
      ? `Moderator: ${moderatorName} · ${restLabel}`
      : `Moderator: ${moderatorName}`;
  }

  return rest.join(", ") || null;
}

/**
 * Polska odmiana liczebnika. forms = [mianownik l.poj. (1),
 * "2-4" (mianownik l.mn.), "5+" (dopełniacz l.mn.)].
 * Np. pluralizePl(n, ["uczestnik", "uczestnicy", "uczestników"]).
 */
export function pluralizePl(
  n: number,
  forms: [string, string, string],
): string {
  if (n === 1) return forms[0];
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }
  return forms[2];
}

// Domyślna strefa, gdy event nie ma ustawionej (spójna z formularzami).
const TZ_FALLBACK = "Europe/Warsaw";

// Offset strefy (ms) dla danego instantu: (ściana zegarowa w tz) - (UTC).
// DST-aware — offset zależy od daty, nie jest stały.
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  const hour = map.hour === "24" ? "0" : map.hour;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

/**
 * Naiwny "YYYY-MM-DDTHH:mm" (z pola datetime-local, godzina W STREFIE EVENTU)
 * -> ISO UTC. Bez zewnętrznej biblioteki: traktujemy wpisaną godzinę jak UTC,
 * po czym odejmujemy offset strefy dla tego instantu. Dwa przebiegi obsługują
 * zmianę offsetu wokół granicy DST.
 */
export function parseDateTimeLocal(
  value: string,
  timeZone: string | null,
): string {
  const tz = timeZone || TZ_FALLBACK;
  const [datePart, timePart = "00:00"] = value.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset1 = tzOffsetMs(tz, new Date(guess));
  const offset2 = tzOffsetMs(tz, new Date(guess - offset1));
  return new Date(guess - offset2).toISOString();
}

/**
 * ISO/timestamp z bazy -> "YYYY-MM-DDTHH:mm" w strefie eventu, do wstawienia
 * jako wartość pola <input type="datetime-local">.
 */
export function toDateTimeLocalValue(
  value: string | null,
  timeZone: string | null,
): string {
  if (!value) return "";
  const tz = timeZone || TZ_FALLBACK;
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(value))) {
    map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
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

// Zakres data+godzina bez redundancji: gdy start i koniec są tego samego dnia
// (w strefie eventu) pokazujemy datę raz — "15 lip 2026, 08:30 – 16:00";
// przy różnych dniach pełny zakres z datą po obu stronach.
export function formatDateTimeRange(
  startsAt: string | null,
  endsAt: string | null,
  timeZone?: string | null,
): string | null {
  if (!startsAt) return null;
  const start = formatDateTime(startsAt, timeZone);
  if (!endsAt) return start;

  const sameDay =
    getDateGroupKey(startsAt, timeZone) === getDateGroupKey(endsAt, timeZone);
  const end = sameDay
    ? formatTime(endsAt, timeZone)
    : formatDateTime(endsAt, timeZone);
  return `${start} – ${end}`;
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
