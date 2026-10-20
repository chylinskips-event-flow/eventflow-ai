import { createHash } from "node:crypto";

// „Wejdź ponownie” — uczestnik prosi o link do swojego panelu na adres podany przy rejestracji.
// Logika bez zależności od Next/Supabase (wstrzykiwane), żeby dało się ją przetestować.
//
// Zasady bezpieczeństwa:
// • odpowiedź jest IDENTYCZNA dla adresu zarejestrowanego i niezarejestrowanego — wyszukanie
//   uczestnika i wysyłka dzieją się dopiero po odpowiedzi (schedule → after()), więc różnicy
//   nie widać ani w treści, ani w czasie odpowiedzi;
// • limit żądań na e-mail i na IP liczony dla KAŻDEGO żądania (także dla nieznanych adresów);
// • link trafia wyłącznie do zatwierdzonego uczestnika TEGO wydarzenia, na adres z rejestracji.

export const ACCESS_LINK_WINDOW_MINUTES = 15;
export const ACCESS_LINK_MAX_PER_EMAIL = 3;
export const ACCESS_LINK_MAX_PER_IP = 10;
// Wiersze limitu starsze niż doba są zbędne — usuwane przy kolejnych żądaniach.
export const ACCESS_LINK_RETENTION_HOURS = 24;

export const ACCESS_LINK_SENT_MESSAGE =
  "Jeśli ten adres jest zarejestrowany na to wydarzenie, wysłaliśmy na niego link.";
export const ACCESS_LINK_RATE_LIMITED_MESSAGE =
  "Zbyt wiele prób. Spróbuj ponownie za kilkanaście minut.";
export const ACCESS_LINK_UNAVAILABLE_MESSAGE =
  "Wysyłanie linków dla tego wydarzenia jest teraz niedostępne.";
export const ACCESS_LINK_INVALID_EMAIL_MESSAGE = "Podaj poprawny adres e-mail.";
export const ACCESS_LINK_ERROR_MESSAGE = "Nie udało się wysłać prośby. Spróbuj ponownie za chwilę.";

export type AccessLinkState = {
  status: "idle" | "sent" | "invalid" | "rate_limited" | "unavailable" | "error";
  message?: string;
};

export type AccessLinkEvent = { id: string; name: string; slug: string; status: string };
export type AccessLinkAttendee = { first_name: string | null; email: string; qr_code_token: string };

export type AccessLinkDeps = {
  findEvent: (slug: string) => Promise<AccessLinkEvent | null>;
  isSuspended: (slug: string) => Promise<boolean>;
  countRecent: (p: { emailHash: string; ipHash: string; since: Date }) => Promise<{ email: number; ip: number }>;
  record: (p: { eventId: string; emailHash: string; ipHash: string; purgeBefore: Date }) => Promise<void>;
  findApprovedAttendee: (eventId: string, email: string) => Promise<AccessLinkAttendee | null>;
  sendLink: (p: { attendee: AccessLinkAttendee; event: AccessLinkEvent }) => Promise<void>;
  /** Uruchamia zadanie po wysłaniu odpowiedzi (w aplikacji: after() z next/server). */
  schedule: (task: () => Promise<void>) => void;
  now: () => Date;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function hashForRateLimit(kind: "email" | "ip", value: string): string {
  return createHash("sha256").update(`eventro-access-link:${kind}:${value}`).digest("hex");
}

/** Pierwszy adres z x-forwarded-for (Vercel), potem x-real-ip; brak → „unknown”. */
export function clientIpFromHeaders(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Szkic nie ma publicznej strony — formularz nie działa. Po evencie uczestnicy zachowują dostęp. */
export function isAccessLinkAvailable(event: Pick<AccessLinkEvent, "status"> | null): boolean {
  return event !== null && event.status !== "draft";
}

export async function requestAccessLinkCore(
  deps: AccessLinkDeps,
  input: { slug: string; email: unknown; ip: string },
): Promise<AccessLinkState> {
  const email = normalizeEmail(input.email);
  if (!email) return { status: "invalid", message: ACCESS_LINK_INVALID_EMAIL_MESSAGE };

  const event = await deps.findEvent(input.slug);
  if (!isAccessLinkAvailable(event) || (await deps.isSuspended(input.slug))) {
    return { status: "unavailable", message: ACCESS_LINK_UNAVAILABLE_MESSAGE };
  }
  const ev = event as AccessLinkEvent;

  const emailHash = hashForRateLimit("email", email);
  const ipHash = hashForRateLimit("ip", input.ip);
  const now = deps.now().getTime();

  try {
    const recent = await deps.countRecent({
      emailHash,
      ipHash,
      since: new Date(now - ACCESS_LINK_WINDOW_MINUTES * 60_000),
    });
    if (recent.email >= ACCESS_LINK_MAX_PER_EMAIL || recent.ip >= ACCESS_LINK_MAX_PER_IP) {
      return { status: "rate_limited", message: ACCESS_LINK_RATE_LIMITED_MESSAGE };
    }
    await deps.record({
      eventId: ev.id,
      emailHash,
      ipHash,
      purgeBefore: new Date(now - ACCESS_LINK_RETENTION_HOURS * 3_600_000),
    });
  } catch (error) {
    // Bez działającego limitu nie wysyłamy (np. brak tabeli przed migracją) — głośno w logach.
    console.error("[access-link] rate limit storage failed:", error);
    return { status: "error", message: ACCESS_LINK_ERROR_MESSAGE };
  }

  deps.schedule(async () => {
    try {
      const attendee = await deps.findApprovedAttendee(ev.id, email);
      if (attendee) await deps.sendLink({ attendee, event: ev });
    } catch (error) {
      console.error("[access-link] lookup/send failed:", error);
    }
  });

  return { status: "sent", message: ACCESS_LINK_SENT_MESSAGE };
}
