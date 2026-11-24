import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee } from "@/lib/attendees";

/**
 * Dawna nazwa cookie — jedna dla wszystkich wydarzeń. Nowe sesje zapisujemy pod nazwą zależną
 * od wydarzenia (attendeeCookieName), a to cookie tylko odczytujemy (zgodność wstecz): nadal
 * loguje do wydarzenia, do którego należy zapisany w nim token, o ile ta przeglądarka nie ma
 * jeszcze cookie tego wydarzenia.
 */
export const ATTENDEE_TOKEN_COOKIE = "eventflow_attendee_token";
export const ATTENDEE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dni

const ATTENDEE_SCOPED_COOKIE_PREFIX = `${ATTENDEE_TOKEN_COOKIE}_`;
/** Limit tokenów z cookie sprawdzanych jednym zapytaniem. */
const MAX_COOKIE_TOKENS = 50;
const TOKEN_PATTERN = /^[A-Za-z0-9-]{1,128}$/;

/**
 * Nazwa cookie sesji uczestnika dla jednego wydarzenia. Osobne cookie na wydarzenie sprawia,
 * że wejście do jednego wydarzenia nie wylogowuje z innego na tym samym hoście.
 * Nazwa zależy od id wydarzenia, a nie od slug — organizator może zmienić slug, a sesja
 * uczestników ma to przetrwać. Id to UUID; inne znaki i tak zamieniamy na bezpieczne.
 */
export function attendeeCookieName(eventId: string): string {
  return `${ATTENDEE_SCOPED_COOKIE_PREFIX}${eventId.toLowerCase().replace(/[^a-z0-9-]/g, "_")}`;
}

export function attendeeCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  };
}

type CookieWriter = {
  set: (name: string, value: string, options: ReturnType<typeof attendeeCookieOptions>) => unknown;
};

/** Zapisuje sesję uczestnika dla danego wydarzenia (cookies() z next/headers lub response.cookies). */
export function setAttendeeSessionCookie(store: CookieWriter, eventId: string, token: string): void {
  store.set(attendeeCookieName(eventId), token, attendeeCookieOptions());
}

type CookieGetter = { get: (name: string) => { value: string } | undefined };
type CookieReader = CookieGetter & { getAll: () => { name: string; value: string }[] };

/**
 * Tokeny z cookie sesji (dawne wspólne + cookie wydarzeń), bez duplikatów i wartości
 * o niepoprawnym formacie. Id wydarzenia poznajemy dopiero z bazy (po slug), dlatego
 * sprawdzamy wszystkie cookie sesji jednym zapytaniem.
 */
export function attendeeCookieTokens(store: CookieReader): string[] {
  const out = new Set<string>();
  const legacy = store.get(ATTENDEE_TOKEN_COOKIE)?.value;
  if (legacy && TOKEN_PATTERN.test(legacy)) out.add(legacy);
  for (const { name, value } of store.getAll()) {
    if (name.startsWith(ATTENDEE_SCOPED_COOKIE_PREFIX) && TOKEN_PATTERN.test(value)) out.add(value);
  }
  return [...out].slice(0, MAX_COOKIE_TOKENS);
}

/**
 * Wybiera zalogowanego uczestnika spośród uczestników JEDNEGO wydarzenia pasujących do tokenów
 * z cookie. Jeśli istnieje cookie tego wydarzenia, decyduje wyłącznie ono: token oczekujący,
 * odrzucony lub nieaktualny oznacza brak sesji (bez sięgania po dawne cookie i bez nadpisywania
 * cookie wydarzenia). Dawne wspólne cookie liczy się tylko, gdy cookie wydarzenia brak.
 */
export function pickAttendeeSession(
  store: CookieGetter,
  rows: Attendee[],
): { attendee: Attendee; fromLegacy: boolean } | null {
  if (rows.length === 0) return null;
  const eventId = rows[0].event_id;
  if (rows.some((r) => r.event_id !== eventId)) return null;

  const own = store.get(attendeeCookieName(eventId))?.value;
  if (own !== undefined) {
    const attendee = rows.find((r) => r.qr_code_token === own);
    return attendee?.status === "approved" ? { attendee, fromLegacy: false } : null;
  }

  const legacy = store.get(ATTENDEE_TOKEN_COOKIE)?.value;
  const attendee = legacy ? rows.find((r) => r.qr_code_token === legacy) : undefined;
  return attendee?.status === "approved" ? { attendee, fromLegacy: true } : null;
}

/**
 * Pobiera attendee po qr_code_token, weryfikując JEDNYM zapytaniem (JOIN
 * przez events!inner), że token rzeczywiście należy do eventu o tym slug —
 * zapobiega pomyleniu/podstawieniu tokenu między różnymi eventami.
 *
 * Używa service_role: RLS nie jest w stanie bezpiecznie wyrazić "anon znał
 * poprawny token" — polityka `using (true)` ujawniłaby całą tabelę. Token
 * (losowy UUID) jest tu właściwą granicą bezpieczeństwa, identycznie jak
 * przy linku rejestracyjnym (getEventBySlugForRegistration).
 */
export async function getAttendeeByTokenAndSlug(
  token: string,
  slug: string,
): Promise<Attendee | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendees")
    .select("*, events!inner(slug)")
    .eq("qr_code_token", token)
    .eq("events.slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const { events, ...attendee } = data as Attendee & { events: { slug: string } };
  void events;
  return attendee;
}

/**
 * Uczestnicy eventu o danym slug (JOIN przez events!inner), których qr_code_token jest
 * jednym z podanych — tokeny innych wydarzeń nie zwracają nic.
 */
async function getAttendeesByTokensAndSlug(tokens: string[], slug: string): Promise<Attendee[]> {
  if (tokens.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendees")
    .select("*, events!inner(slug)")
    .in("qr_code_token", tokens)
    .eq("events.slug", slug);

  if (error || !data) return [];
  return (data as (Attendee & { events: { slug: string } })[]).map(({ events, ...attendee }) => {
    void events;
    return attendee;
  });
}

/**
 * Odczytuje cookie sesji uczestnika (cookie wydarzenia, a gdy go brak — dawne wspólne)
 * i weryfikuje token względem danego eventu (po slug) — zwraca attendee tylko jeśli token
 * istnieje, należy do tego eventu, ORAZ status === 'approved'. Fundament dla innych stron na
 * /e/[slug]/* (np. agenda, "moja agenda" w przyszłych krokach).
 */
export async function getCurrentAttendee(slug: string): Promise<Attendee | null> {
  const cookieStore = await cookies();
  const tokens = attendeeCookieTokens(cookieStore);
  if (tokens.length === 0) return null;

  const session = pickAttendeeSession(cookieStore, await getAttendeesByTokensAndSlug(tokens, slug));
  if (!session) return null;

  if (session.fromLegacy) {
    // Leniwa migracja dawnego cookie do cookie tego wydarzenia. Zapis cookie działa tylko
    // w akcjach serwera i route handlerach — w komponencie serwerowym rzuca, wtedy pomijamy
    // (dawne cookie nadal działa i migracja nastąpi przy najbliższej akcji).
    try {
      setAttendeeSessionCookie(cookieStore, session.attendee.event_id, session.attendee.qr_code_token);
    } catch {
      // komponent serwerowy — bez zapisu
    }
  }
  return session.attendee;
}

/**
 * Usuwa sesję uczestnika danego wydarzenia: cookie wydarzenia oraz dawne wspólne cookie,
 * jeśli zawiera token tego uczestnika (cookie innych wydarzeń zostają).
 */
export async function clearAttendeeSession(eventId: string, token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: attendeeCookieName(eventId), path: "/" });
  if (cookieStore.get(ATTENDEE_TOKEN_COOKIE)?.value === token) {
    cookieStore.delete({ name: ATTENDEE_TOKEN_COOKIE, path: "/" });
  }
}
