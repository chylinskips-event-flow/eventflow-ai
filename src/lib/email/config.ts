// Jedyne źródło nadawcy maili aplikacyjnych: zmienna środowiskowa RESEND_FROM.
// Brak fallbacku (np. onboarding@resend.dev) — domena testowa Resend przyjmuje tylko adres
// właściciela konta i zwraca 403, co wyglądało jak „maile nie dochodzą”. Brak/błąd = wyjątek.

export const EMAIL_FROM_ENV = "RESEND_FROM";
export const EMAIL_REPLY_TO = "kontakt@eventro.pl";

// "Nazwa <adres@domena.pl>" albo sam "adres@domena.pl".
const FROM_PATTERN = /^(?:[^<>]+ <[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/;

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

function fail(message: string): never {
  console.error(`[email] ${message}`);
  throw new EmailConfigError(message);
}

/** Czyści wartość wklejoną z cudzysłowami (np. `"Eventro <no-reply@eventro.pl>"` w panelu Vercel). */
export function normalizeFromAddress(raw: string): string {
  const trimmed = raw.trim();
  const unquoted = /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
  return unquoted;
}

export function getFromAddress(): string {
  const raw = process.env[EMAIL_FROM_ENV];
  if (!raw || !raw.trim()) {
    fail(
      `${EMAIL_FROM_ENV} is not set (VERCEL_ENV=${process.env.VERCEL_ENV ?? "local"}). ` +
        `Set ${EMAIL_FROM_ENV}="Eventro <no-reply@eventro.pl>" for this environment and redeploy.`,
    );
  }
  const from = normalizeFromAddress(raw);
  if (!FROM_PATTERN.test(from)) {
    fail(`${EMAIL_FROM_ENV} has invalid format: ${JSON.stringify(raw)}. Expected "Name <address@domain>" or "address@domain".`);
  }
  if (/@resend\.dev>?$/i.test(from)) {
    console.warn(`[email] ${EMAIL_FROM_ENV} uses the Resend test domain (${from}) — only the account owner's address will receive mail.`);
  }
  return from;
}

export function getResendApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) fail(`RESEND_API_KEY is not set (VERCEL_ENV=${process.env.VERCEL_ENV ?? "local"}).`);
  return key;
}
