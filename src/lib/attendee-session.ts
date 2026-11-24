import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee } from "@/lib/attendees";

/**
 * Dawna nazwa cookie — jedna dla wszystkich wydarzeń. Nowe sesje zapisujemy pod nazwą zależną
 * od wydarzenia (attendeeCookieName), a to cookie tylko odczytujemy (zgodność wstecz): nadal
 * loguje do wydarzenia, do którego należy zapisany w nim token.
 */
export const ATTENDEE_TOKEN_COOKIE = "eventflow_attendee_token";
export const ATTENDEE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dni

/**
 * Nazwa cookie sesji uczestnika dla jednego wydarzenia. Osobne cookie na wydarzenie sprawia,
 * że wejście do jednego wydarzenia nie wylogowuje z innego na tym samym hoście.
 * Slug ma format [a-z0-9-] (SLUG_PATTERN) — inne znaki zamieniamy, żeby nazwa była poprawna.
 */
export function attendeeCookieName(slug: string): string {
  return `${ATTENDEE_TOKEN_COOKIE}_${slug.toLowerCase().replace(/[^a-z0-9-]/g, "_")}`;
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
export function setAttendeeSessionCookie(store: CookieWriter, slug: string, token: string): void {
  store.set(attendeeCookieName(slug), token, attendeeCookieOptions());
}

type CookieReader = { get: (name: string) => { value: string } | undefined };

/**
 * Tokeny do sprawdzenia dla wydarzenia, w kolejności: cookie tego wydarzenia, potem dawne
 * wspólne cookie (bez duplikatów).
 */
export function attendeeTokenCandidates(
  store: CookieReader,
  slug: string,
): { token: string; legacy: boolean }[] {
  const scoped = store.get(attendeeCookieName(slug))?.value;
  const legacy = store.get(ATTENDEE_TOKEN_COOKIE)?.value;
  const out: { token: string; legacy: boolean }[] = [];
  if (scoped) out.push({ token: scoped, legacy: false });
  if (legacy && legacy !== scoped) out.push({ token: legacy, legacy: true });
  return out;
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
 * Odczytuje cookie tokenu uczestnika (cookie wydarzenia, potem dawne wspólne)
 * i weryfikuje go względem danego eventu (po slug) — zwraca attendee tylko jeśli token
 * istnieje, należy do tego eventu, ORAZ status === 'approved'. Fundament dla innych stron na
 * /e/[slug]/* (np. agenda, "moja agenda" w przyszłych krokach).
 */
export async function getCurrentAttendee(slug: string): Promise<Attendee | null> {
  const cookieStore = await cookies();

  for (const { token, legacy } of attendeeTokenCandidates(cookieStore, slug)) {
    const attendee = await getAttendeeByTokenAndSlug(token, slug);
    if (!attendee || attendee.status !== "approved") continue;

    if (legacy) {
      // Leniwa migracja dawnego cookie do cookie tego wydarzenia. Zapis cookie działa tylko
      // w akcjach serwera i route handlerach — w komponencie serwerowym rzuca, wtedy pomijamy
      // (dawne cookie nadal działa i migracja nastąpi przy najbliższej akcji).
      try {
        setAttendeeSessionCookie(cookieStore, slug, token);
      } catch {
        // komponent serwerowy — bez zapisu
      }
    }
    return attendee;
  }

  return null;
}

/**
 * Usuwa sesję uczestnika danego wydarzenia: cookie wydarzenia oraz dawne wspólne cookie,
 * jeśli zawiera token tego uczestnika (cookie innych wydarzeń zostają).
 */
export async function clearAttendeeSession(slug: string, token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: attendeeCookieName(slug), path: "/" });
  if (cookieStore.get(ATTENDEE_TOKEN_COOKIE)?.value === token) {
    cookieStore.delete({ name: ATTENDEE_TOKEN_COOKIE, path: "/" });
  }
}
