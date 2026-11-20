import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { FAKE_RESEND_URL, localSupabase } from "./env";

export type SeedState = {
  organizerEmail: string;
  partnerEmail: string;
  events: Record<"open" | "approval" | "tickets" | "draft", { id: string; slug: string; name: string }>;
  sessionId: string;
  partnerId: string;
  partnerQrToken: string;
  freeTicketId: string;
};

const STATE_FILE = path.resolve("e2e/.state.json");

export function saveState(state: SeedState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function state(): SeedState {
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

/** Klient service_role do LOKALNEGO Supabase (dane testowe i sprawdzanie stanu bazy). */
export function admin(): SupabaseClient {
  const sb = localSupabase();
  return createClient(sb.apiUrl, sb.serviceRoleKey, { auth: { persistSession: false } });
}

/** Klient z publicznym kluczem anon — tak widzi bazę dowolna osoba z przeglądarki. */
export function anon(): SupabaseClient {
  const sb = localSupabase();
  return createClient(sb.apiUrl, sb.anonKey, { auth: { persistSession: false } });
}

// ─── Maile aplikacji (atrapa Resend) ─────────────────────────────────────────

export type AppMail = { id: string; to: string | string[]; subject: string; html: string; attachments: { filename: string }[] };

export async function appMails(to: string): Promise<AppMail[]> {
  const res = await fetch(`${FAKE_RESEND_URL}/__messages?to=${encodeURIComponent(to)}`);
  return res.json();
}

export async function waitForAppMail(to: string, subject: RegExp): Promise<AppMail> {
  let found: AppMail | undefined;
  await expect
    .poll(async () => {
      found = (await appMails(to)).find((m) => subject.test(m.subject));
      return Boolean(found);
    }, { message: `mail „${subject}” do ${to}`, timeout: 20_000 })
    .toBe(true);
  return found!;
}

export function linksIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

// ─── Maile Supabase Auth (Mailpit w lokalnym Supabase) ───────────────────────

type MailpitList = { messages: { ID: string; To: { Address: string }[]; Created: string }[] };

/** Link z ostatniego maila logowania (magic link) wysłanego na adres. */
export async function latestAuthLink(email: string, after: Date): Promise<string> {
  const { mailUrl } = localSupabase();
  let link = "";
  await expect
    .poll(async () => {
      const list = (await (await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as MailpitList;
      const msg = list.messages.find((m) => new Date(m.Created) >= after);
      if (!msg) return false;
      const full = (await (await fetch(`${mailUrl}/api/v1/message/${msg.ID}`)).json()) as { HTML: string; Text: string };
      const match = /(https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+)/.exec(full.HTML || full.Text);
      link = match ? match[1].replace(/&amp;/g, "&") : "";
      return Boolean(link);
    }, { message: `mail logowania do ${email}`, timeout: 20_000 })
    .toBe(true);
  return link;
}

/** Logowanie organizatora albo partnera prawdziwą ścieżką: formularz → mail → link. */
export async function loginWithMagicLink(page: Page, loginPath: string, email: string) {
  const sent = new Date(Date.now() - 1000);
  await page.goto(loginPath);
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByRole("button", { name: /wyślij|link/i }).click();
  await expect(page.getByText(/sprawdź|wysłaliśmy|wysłano/i).first()).toBeVisible();
  const link = await latestAuthLink(email, sent);
  if (process.env.E2E_DEBUG) {
    console.log("[e2e] auth link:", link);
    page.on("framenavigated", (f) => f === page.mainFrame() && console.log("[e2e] ->", f.url()));
    page.on("response", (r) => r.status() >= 300 && r.status() < 400 && console.log("[e2e] redirect", r.status(), r.url(), "=>", r.headers()["location"]));
  }
  await page.goto(link);
}
