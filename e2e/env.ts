// Klucze LOKALNEGO Supabase (`supabase start`). Testy end-to-end nigdy nie łączą się
// z bazą wspólną dla Preview i produkcji: adres inny niż 127.0.0.1/localhost przerywa start.
import { execSync } from "node:child_process";

export type LocalSupabase = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailUrl: string;
};

let cached: LocalSupabase | null = null;

export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  let raw: string;
  try {
    raw = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("Lokalny Supabase nie działa. Uruchom: npx supabase start");
  }
  const env = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  const apiUrl = env.API_URL;
  const host = apiUrl ? new URL(apiUrl).hostname : "";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Odmowa: testy E2E tylko na lokalnym Supabase (dostałem ${host || "brak adresu"}).`);
  }
  cached = {
    apiUrl,
    anonKey: env.ANON_KEY ?? env.PUBLISHABLE_KEY,
    serviceRoleKey: env.SERVICE_ROLE_KEY ?? env.SECRET_KEY,
    mailUrl: env.MAILPIT_URL ?? env.INBUCKET_URL ?? "http://127.0.0.1:54324",
  };
  return cached;
}

export const APP_PORT = 3100;
export const MAIL_PORT = 3199;
// localhost, nie 127.0.0.1: serwer deweloperski Next podaje w request.nextUrl host „localhost”,
// a zmiana hosta w trakcie logowania gubi ciasteczka sesji.
export const APP_URL = `http://localhost:${APP_PORT}`;
export const FAKE_RESEND_URL = `http://127.0.0.1:${MAIL_PORT}`;
