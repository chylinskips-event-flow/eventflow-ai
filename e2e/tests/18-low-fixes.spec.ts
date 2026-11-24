import { expect, test, type Browser } from "@playwright/test";
import { admin, loginWithMagicLink, state, waitForAppMail } from "../helpers";

// Poprawki błędów niskiej wagi widoczne dla użytkownika:
// osobne sesje uczestnika na wydarzenie, polskie teksty i link do polityki w kasie, 404 dla
// nieistniejącego wydarzenia, nagłówki bezpieczeństwa, robots.txt i sitemap.xml, temat maila
// ze znakiem „&”, odmiana „Ostatnie N miejsc”, zwolnienie miejsca po usunięciu uczestnika,
// odmowa usunięcia typu biletu z zamówieniami, ponowna rejestracja osoby oczekującej,
// link recepcji wyłączony w trakcie zmiany, pytanie wycofane przez partnera, nowy link rzutnika Mixera.
//
// Plik jest niezależny od innych: własne logowanie, własne wydarzenia w organizacji E2E,
// własni uczestnicy, partnerzy i mixery.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-18.json";
const NO_SESSION = { storageState: { cookies: [], origins: [] } };
const RUN = Date.now().toString(36);
const TZ = "Europe/Warsaw";

type Ev = { id: string; slug: string; name: string };
const events: Record<string, Ev> = {};
let orgId = "";

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function organizationId(): Promise<string> {
  if (orgId) return orgId;
  const { data, error } = await admin().from("organizations").select("id").eq("slug", "e2e-org").single();
  if (error || !data) throw new Error(`[18] organizacja E2E: ${error?.message ?? "brak"}`);
  orgId = data.id;
  return orgId;
}

/** Własne opublikowane wydarzenie (tworzone raz na klucz). */
async function ensureEvent(key: string, extra: Record<string, unknown> = {}): Promise<Ev> {
  if (events[key]) return events[key];
  const { data, error } = await admin()
    .from("events")
    .insert({
      organization_id: await organizationId(),
      slug: `e2e-18-${key}-${RUN}`,
      name: `E2E18 ${key} ${RUN}`,
      status: "published",
      requires_approval: false,
      timezone: TZ,
      starts_at: at(10, 8),
      ends_at: at(10, 16),
      location: "Łódź, Hala Expo",
      ...extra,
    })
    .select("id, slug, name")
    .single();
  if (error || !data) throw new Error(`[18] wydarzenie ${key}: ${error?.message ?? "brak"}`);
  events[key] = data as Ev;
  return events[key];
}

async function insertAttendee(eventId: string, who: { first: string; last: string; email: string }, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin()
    .from("attendees")
    .insert({ event_id: eventId, first_name: who.first, last_name: who.last, email: who.email, status: "approved", ...extra })
    .select("id, qr_code_token")
    .single();
  if (error || !data) throw new Error(`[18] uczestnik ${who.email}: ${error?.message}`);
  return data as { id: string; qr_code_token: string };
}

async function insertTicketType(eventId: string, row: Record<string, unknown>) {
  const { data, error } = await admin().from("ticket_types").insert({ event_id: eventId, ...row }).select("id").single();
  if (error || !data) throw new Error(`[18] typ biletu: ${error?.message}`);
  return data.id as string;
}

/** Rejestracja przez kasę z darmowym biletem w czystej przeglądarce. */
async function freeCheckout(browser: Browser, ev: Ev, ticketId: string, who: { first: string; last: string; email: string }) {
  const ctx = await browser.newContext(NO_SESSION);
  const p = await ctx.newPage();
  await p.goto(`/e/${ev.slug}/checkout?ticket=${ticketId}`);
  await p.locator("#co-first").fill(who.first);
  await p.locator("#co-last").fill(who.last);
  await p.locator("#co-email").fill(who.email);
  await p.locator("#co-gdpr").click();
  await p.getByRole("button", { name: "Zarejestruj się bezpłatnie" }).click();
  await expect(p).toHaveURL(/checkout\/success|\/welcome/);
  await ctx.close();
}

test("logowanie organizatora (sesja dla testów poprawek)", async ({ page }) => {
  await organizationId();
  await loginWithMagicLink(page, "/login", state().organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

// ─── Uczestnik ───────────────────────────────────────────────────────────────

test("dwa wydarzenia w tej samej przeglądarce: obie sesje uczestnika zostają", async ({ browser }) => {
  const a = await ensureEvent("sesja-a");
  const b = await ensureEvent("sesja-b");
  const attA = await insertAttendee(a.id, { first: "Alicja", last: "Pierwsza18", email: `alicja.18.${RUN}@e2e.test` });
  const attB = await insertAttendee(b.id, { first: "Bartosz", last: "Drugi18", email: `bartosz.18.${RUN}@e2e.test` });

  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  await expect(async () => {
    await page.goto(`/e/${a.slug}/a/${attA.qr_code_token}`);
    await expect(page.getByText(/Cześć, Alicja/)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  await page.goto(`/e/${b.slug}/a/${attB.qr_code_token}`);
  await expect(page.getByText(/Cześć, Bartosz/)).toBeVisible();

  // Powrót do pierwszego wydarzenia: nadal zalogowana Alicja (wejście do B nie wylogowało z A).
  await page.goto(`/e/${a.slug}`);
  await expect(page.getByText(/Cześć, Alicja/)).toBeVisible();
  await page.goto(`/e/${b.slug}`);
  await expect(page.getByText(/Cześć, Bartosz/)).toBeVisible();

  const names = (await ctx.cookies()).map((c) => c.name);
  expect(names).toContain(`eventflow_attendee_token_${a.id}`);
  expect(names).toContain(`eventflow_attendee_token_${b.id}`);
  await ctx.close();
});

test("ponowna rejestracja osoby oczekującej: komunikat o zgłoszeniu czekającym na zatwierdzenie", async ({ page }) => {
  const ev = await ensureEvent("oczekujacy", { requires_approval: true });
  const who = { first: "Olga", last: "Oczekująca18", email: `olga.pending.18.${RUN}@e2e.test` };
  await insertAttendee(ev.id, who, { status: "pending" });

  await page.goto(`/e/${ev.slug}/register`);
  await page.locator("#first_name").fill(who.first);
  await page.locator("#last_name").fill(who.last);
  await page.locator("#email").fill(who.email.toUpperCase());
  await page.locator("#gdpr_consent").click();
  await page.getByRole("button", { name: "Zarejestruj się" }).click();
  await expect(page.getByText(/zgłoszenie czeka na zatwierdzenie przez organizatora/)).toBeVisible();
  await expect(page.getByText(/Wysłaliśmy link do Twojego panelu/)).toHaveCount(0);

  const { count } = await admin()
    .from("attendees")
    .select("id", { count: "exact", head: true })
    .eq("event_id", ev.id)
    .ilike("email", who.email);
  expect(count, "bez drugiego rekordu").toBe(1);
});

// ─── Strona wydarzenia, kasa, mail ───────────────────────────────────────────

test("kasa: polskie znaki i link do polityki prywatności w zgodzie RODO", async ({ page }) => {
  const ev = await ensureEvent("kasa");
  const free = await insertTicketType(ev.id, { name: "E2E18 Wejściówka", price: 0, quantity_total: 50 });
  await page.goto(`/e/${ev.slug}/checkout?ticket=${free}`);
  await expect(page.getByText("Imię *")).toBeVisible();
  await expect(page.getByText("Na ten adres wyślemy bilet z kodem QR.")).toBeVisible();
  await expect(page.getByText(/Wyrażam zgodę na przetwarzanie moich danych osobowych/)).toBeVisible();
  await expect(page.getByText(/Wyrażam zgodę na przesyłanie informacji marketingowych/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Zarejestruj się bezpłatnie" })).toBeVisible();
  const privacy = page.getByRole("link", { name: "Polityką prywatności" });
  await expect(privacy).toHaveAttribute("href", "/privacy");
  const body = await page.locator("body").innerText();
  for (const ascii of ["Imie *", "Wyrazam zgode", "wyslemy", "Zarejestruj sie", "Przejdz do platnosci"]) {
    expect(body, `bez tekstu bez polskich znaków: ${ascii}`).not.toContain(ascii);
  }
});

test("strona wydarzenia: „Ostatnie 5 miejsc” (poprawna odmiana)", async ({ page }) => {
  const ev = await ensureEvent("miejsca");
  await insertTicketType(ev.id, { name: "E2E18 Pula pięciu", price: 0, quantity_total: 5 });
  await page.goto(`/e/${ev.slug}`);
  await expect(page.getByText("Ostatnie 5 miejsc", { exact: true })).toBeVisible();
  await expect(page.getByText("Ostatnie 5 miejsca")).toHaveCount(0);
});

test("nieistniejące wydarzenie: HTTP 404", async ({ request }) => {
  const res = await request.get(`/e/nie-ma-takiego-wydarzenia-${RUN}`);
  expect(res.status()).toBe(404);
});

test("temat maila ze znakiem „&” przychodzi jako zwykły tekst", async ({ page }) => {
  const ev = await ensureEvent("rock");
  const name = `Rock & Roll ${RUN}`;
  await admin().from("events").update({ name }).eq("id", ev.id);
  const who = { first: "Roman", last: "Rockowy18", email: `roman.rock.18.${RUN}@e2e.test` };

  await page.goto(`/e/${ev.slug}/register`);
  await page.locator("#first_name").fill(who.first);
  await page.locator("#last_name").fill(who.last);
  await page.locator("#email").fill(who.email);
  await page.locator("#gdpr_consent").click();
  await page.getByRole("button", { name: "Zarejestruj się" }).click();
  const mail = await waitForAppMail(who.email, /Potwierdzenie rejestracji/);
  expect(mail.subject).toContain(name);
  expect(mail.subject).not.toContain("&amp;");
});

// ─── Nagłówki, robots, sitemap ───────────────────────────────────────────────

test("robots.txt i sitemap.xml odpowiadają", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const txt = await robots.text();
  expect(txt).toMatch(/User-Agent:\s*\*/i);
  expect(txt).toMatch(/Disallow:\s*\/api\//);
  expect(txt).toMatch(/Sitemap:/i);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toMatch(/xml/);
  expect(await sitemap.text()).toContain("<urlset");
});

test("nagłówki bezpieczeństwa na stronie wydarzenia; rzutnik bez blokady ramki", async ({ request }) => {
  const ev = await ensureEvent("naglowki");
  const res = await request.get(`/e/${ev.slug}`);
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBeTruthy();
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'self'");

  // Ekran rzutnika (osadzany w narzędziach do prezentacji) bez blokady ramki.
  const projector = await request.get(`/p/${crypto.randomUUID()}`);
  expect(projector.headers()["x-content-type-options"]).toBe("nosniff");
  expect(projector.headers()["x-frame-options"]).toBeUndefined();
});

// ─── Recepcja ────────────────────────────────────────────────────────────────

test("link recepcji wyłączony w trakcie zmiany: „Link nieaktywny” zamiast błędu strony", async ({ browser }) => {
  const ev = await ensureEvent("recepcja");
  const db = admin();
  const token = crypto.randomUUID();
  await db.from("events").update({ reception_token: token }).eq("id", ev.id);
  await insertAttendee(ev.id, { first: "Renata", last: "Recepcyjna18", email: `renata.18.${RUN}@e2e.test` });

  const ctx = await browser.newContext(NO_SESSION);
  const s = await ctx.newPage();
  const errors: string[] = [];
  s.on("pageerror", (e) => errors.push(e.message));
  await s.goto(`/e/${ev.slug}/recepcja/${token}`);
  await expect(s.getByText("Renata Recepcyjna18")).toBeVisible();

  // Organizator wyłącza link, gdy obsługa ma otwartą listę.
  await db.from("events").update({ reception_token: null }).eq("id", ev.id);
  await s.getByRole("button", { name: "Zamelduj" }).first().click();
  await expect(s.getByRole("alert").getByText("Link nieaktywny")).toBeVisible();
  await expect(s.getByText(/Application error|Something went wrong/i)).toHaveCount(0);
  expect(errors, "bez wyjątków w przeglądarce").toEqual([]);

  const { data: att } = await db.from("attendees").select("checked_in_at").eq("event_id", ev.id).single();
  expect(att?.checked_in_at, "bez meldunku po wyłączeniu linku").toBeNull();
  await ctx.close();
});

// ─── Panel organizatora ──────────────────────────────────────────────────────

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("nagłówki bezpieczeństwa w panelu /admin", async ({ request }) => {
    const res = await request.get("/admin");
    expect(res.status()).toBe(200);
    expect(res.url()).toMatch(/\/admin/);
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'self'");
  });

  test("usunięcie uczestnika zwalnia miejsce; typu biletu z zamówieniami nie da się usunąć", async ({ page, browser }) => {
    const ev = await ensureEvent("usuwanie");
    const db = admin();
    const ticketName = `E2E18 Bilet usuwany ${RUN}`;
    const ticketId = await insertTicketType(ev.id, { name: ticketName, price: 0, quantity_total: 10 });
    const who = { first: "Damian", last: "Usuwany18", email: `damian.usun.18.${RUN}@e2e.test` };
    await freeCheckout(browser, ev, ticketId, who);
    await expect.poll(async () => (await db.from("ticket_types").select("quantity_sold").eq("id", ticketId).single()).data?.quantity_sold).toBe(1);

    // Organizator usuwa dane uczestnika → bilet anulowany, miejsce wraca do puli.
    await page.goto(`/admin/events/${ev.id}/attendees`);
    const card = page.locator("[data-slot=card]", { hasText: who.email });
    await card.getByRole("button", { name: "Usuń", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Usuń trwale" }).click();
    await expect
      .poll(async () => (await db.from("attendees").select("id", { count: "exact", head: true }).eq("event_id", ev.id).ilike("email", who.email)).count)
      .toBe(0);
    await expect.poll(async () => (await db.from("ticket_types").select("quantity_sold").eq("id", ticketId).single()).data?.quantity_sold).toBe(0);
    const { data: tickets } = await db.from("tickets").select("status").eq("event_id", ev.id).ilike("holder_email", who.email);
    expect(tickets?.every((t) => t.status === "cancelled"), "bilety anulowane").toBe(true);

    // Zamówienie zostaje, więc typu biletu nie da się usunąć — czytelny komunikat po polsku.
    await page.goto(`/admin/events/${ev.id}/tickets?tab=typy`);
    const row = page.locator("tr", { hasText: ticketName });
    await row.getByRole("button").last().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Usuń typ biletu")).toBeVisible();
    await dialog.getByRole("button", { name: "Usuń", exact: true }).click();
    await expect(page.getByText("Nie można usunąć typu biletu, który ma zamówienia — wyłącz sprzedaż.")).toBeVisible();
    const { data: still } = await db.from("ticket_types").select("id").eq("id", ticketId);
    expect(still).toHaveLength(1);
  });

  test("pytanie wycofane przez partnera nie może zostać zatwierdzone z nieaktualnej karty", async ({ page }) => {
    const ev = await ensureEvent("pytania");
    const db = admin();
    const { data: partner, error } = await db.from("partners").insert({ event_id: ev.id, name: `Partner E2E18 ${RUN}`, tier: "silver" }).select("id").single();
    if (error || !partner) throw new Error(`[18] partner: ${error?.message}`);
    const prompt = `Czy interesuje Cię demo? ${RUN}`;
    const { data: q, error: qErr } = await db
      .from("partner_questions")
      .insert({ partner_id: partner.id, event_id: ev.id, kind: "text", prompt, status: "pending" })
      .select("id")
      .single();
    if (qErr || !q) throw new Error(`[18] pytanie: ${qErr?.message}`);

    await page.goto(`/admin/events/${ev.id}/partners/${partner.id}?tab=leady`);
    const item = page.locator("li", { hasText: prompt });
    await expect(item.getByRole("button", { name: "Akceptuj" })).toBeVisible();

    // Partner usuwa pytanie, gdy organizator ma otwartą stronę.
    await db.from("partner_questions").update({ status: "rejected", review_note: "Usunięte przez partnera." }).eq("id", q.id);
    await item.getByRole("button", { name: "Akceptuj" }).click();
    await expect(page.getByText("Partner wycofał to pytanie — odśwież stronę.")).toBeVisible();
    const { data: after } = await db.from("partner_questions").select("status, review_note").eq("id", q.id).single();
    expect(after).toEqual({ status: "rejected", review_note: "Usunięte przez partnera." });
  });

  test("Mixer: nowy link rzutnika unieważnia stary", async ({ page, request }) => {
    const ev = await ensureEvent("mixer");
    const db = admin();
    const { data: mixer, error } = await db
      .from("mixers")
      .insert({ event_id: ev.id, name: `Mixer E2E18 ${RUN}`, status: "generated" })
      .select("id, present_token")
      .single();
    if (error || !mixer) throw new Error(`[18] mixer: ${error?.message}`);
    const oldToken = mixer.present_token as string;
    expect(oldToken).toBeTruthy();
    expect((await request.get(`/p/${oldToken}`)).status()).toBe(200);

    await page.goto(`/admin/events/${ev.id}/mixer/${mixer.id}`);
    const projectorLink = page.getByRole("link", { name: "Rzutnik" });
    await expect(projectorLink).toHaveAttribute("href", `/p/${oldToken}`);
    await page.getByRole("button", { name: "Nowy link" }).click();
    await expect(projectorLink).not.toHaveAttribute("href", `/p/${oldToken}`);

    const { data: after } = await db.from("mixers").select("present_token").eq("id", mixer.id).single();
    const newToken = after?.present_token as string;
    expect(newToken).not.toBe(oldToken);
    await expect(projectorLink).toHaveAttribute("href", `/p/${newToken}`);
    expect((await request.get(`/p/${oldToken}`)).status(), "stary link nie działa").toBe(404);
    expect((await request.get(`/p/${newToken}`)).status()).toBe(200);
  });
});
