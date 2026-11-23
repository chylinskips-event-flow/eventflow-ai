import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { admin, appMails, loginWithMagicLink, state, waitForAppMail } from "../helpers";

// Poprawki błędów średniej wagi widoczne dla użytkownika:
// rabat 100% bez bramki płatności i limit użyć kodu, bilet darmowy przy zatwierdzaniu zgłoszeń
// (i zwolnienie miejsca po odrzuceniu), okno sprzedaży w strefie wydarzenia, ponowne wydanie
// nagrody bez zmiany magazynu, stoisko bez punktów przy wyłączonej grywalizacji, link recepcji
// po zawieszeniu / usunięciu wydarzenia, podwójne wysłanie formularza organizacji,
// limit 4 MB plików w panelu partnera.
//
// Plik jest niezależny od innych: własne logowanie, własne wydarzenia w organizacji E2E,
// własni uczestnicy, partnerzy i konta.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-17.json";
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
  if (error || !data) throw new Error(`[17] organizacja E2E: ${error?.message ?? "brak"}`);
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
      slug: `e2e-17-${key}-${RUN}`,
      name: `E2E17 ${key} ${RUN}`,
      status: "published",
      requires_approval: false,
      timezone: TZ,
      starts_at: at(10, 8),
      ends_at: at(10, 16),
      location: "Łódź, Hala Expo",
      gamification_enabled: true,
      ...extra,
    })
    .select("id, slug, name")
    .single();
  if (error || !data) throw new Error(`[17] wydarzenie ${key}: ${error?.message ?? "brak"}`);
  events[key] = data as Ev;
  return events[key];
}

async function insertAttendee(eventId: string, who: { first: string; last: string; email: string }, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin()
    .from("attendees")
    .insert({ event_id: eventId, first_name: who.first, last_name: who.last, email: who.email, status: "approved", ...extra })
    .select("id, qr_code_token")
    .single();
  if (error || !data) throw new Error(`[17] uczestnik ${who.email}: ${error?.message}`);
  return data as { id: string; qr_code_token: string };
}

async function insertTicketType(eventId: string, row: Record<string, unknown>) {
  const { data, error } = await admin().from("ticket_types").insert({ event_id: eventId, ...row }).select("id").single();
  if (error || !data) throw new Error(`[17] typ biletu: ${error?.message}`);
  return data.id as string;
}

async function fillBuyer(page: Page, who: { first: string; last: string; email: string }) {
  await page.locator("#co-first").fill(who.first);
  await page.locator("#co-last").fill(who.last);
  await page.locator("#co-email").fill(who.email);
  await page.locator("#co-gdpr").click();
}

/** Godzina w strefie Europe/Warsaw w formacie pola datetime-local ("YYYY-MM-DDTHH:mm"). */
function warsawLocal(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Ten sam zapis co w panelu biletów (pl-PL, strefa wydarzenia). */
function panelDate(d: Date): string {
  return d.toLocaleString("pl-PL", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function minuteFloor(ms: number) {
  return new Date(Math.floor(ms / 60_000) * 60_000);
}

/** Uczestnik w czystej przeglądarce — sesja z linku wejściowego. */
async function participantPage(browser: Browser, slug: string, qr: string, firstName: string) {
  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  await expect(async () => {
    await page.goto(`/e/${slug}/a/${qr}`);
    await expect(page.getByText(new RegExp(`Cześć, ${firstName}`))).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  return { ctx, page };
}

async function redeemSectionFor(page: Page, attendeeName: string) {
  const section = page.locator("[data-slot=card]", { hasText: "Wydaj nagrodę uczestnikowi" });
  await expect(section).toBeVisible();
  await section.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(attendeeName) }).click();
  return section;
}

function redeemRow(section: Locator, rewardName: string) {
  return section.locator("div.rounded-md.border", { hasText: rewardName });
}

test("logowanie organizatora (sesja dla testów poprawek)", async ({ page }) => {
  await organizationId();
  await loginWithMagicLink(page, "/login", state().organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

// ─── Bilety i kody rabatowe ──────────────────────────────────────────────────

test("kod rabatowy 100%: zamówienie na 0 zł bez Przelewy24, licznik użyć +1, limit egzekwowany", async ({ browser }) => {
  const ev = await ensureEvent("rabat");
  const db = admin();
  const ticketId = await insertTicketType(ev.id, { name: "E2E17 Bilet płatny", price: 5000, quantity_total: 10 });
  const code = `E2E17PELNY${RUN}`.toUpperCase();
  const { data: dc, error } = await db
    .from("discount_codes")
    .insert({ event_id: ev.id, code, kind: "percent", value: 100, max_uses: 1, enabled: true })
    .select("id")
    .single();
  if (error || !dc) throw new Error(`[17] kod: ${error?.message}`);

  // Warunek: organizacja nie ma konfiguracji Przelewy24 — płatna ścieżka skończyłaby się błędem.
  const { data: cfg } = await db.from("organizer_payment_config").select("id").eq("organization_id", await organizationId()).maybeSingle();
  expect(cfg, "organizacja E2E bez konfiguracji Przelewy24").toBeNull();

  const buyer = { first: "Rafał", last: "Rabatowy", email: `rafal.rabat.17.${RUN}@e2e.test` };
  const ctx = await browser.newContext(NO_SESSION);
  const p = await ctx.newPage();
  await p.goto(`/e/${ev.slug}/checkout?ticket=${ticketId}`);
  await expect(p.getByText("KUP BILET", { exact: true })).toBeVisible();
  await fillBuyer(p, buyer);
  await p.locator("#co-marketing").click();
  await p.getByText("Mam kod rabatowy").click();
  await p.locator("#co-discount").fill(code.toLowerCase());
  await p.getByRole("button", { name: /Przejd[zź] do p[lł]atno[sś]ci/ }).click();
  await expect(p).toHaveURL(/checkout\/success/);
  await expect(p.getByText(/P[lł]atno[sś]ci nie s[aą] skonfigurowane/i)).toHaveCount(0);
  await waitForAppMail(buyer.email, /Potwierdzenie rejestracji/);
  await ctx.close();

  const { data: orders } = await db
    .from("orders")
    .select("status, total_amount, discount_code_id, buyer_first_name, buyer_last_name, marketing_consent")
    .eq("event_id", ev.id)
    .ilike("buyer_email", buyer.email);
  expect(orders).toHaveLength(1);
  expect(orders![0]).toMatchObject({
    status: "paid",
    total_amount: 0,
    discount_code_id: dc.id,
    buyer_first_name: buyer.first,
    buyer_last_name: buyer.last,
    marketing_consent: true,
  });
  const { data: tickets } = await db.from("tickets").select("status").eq("event_id", ev.id).ilike("holder_email", buyer.email);
  expect(tickets).toEqual([{ status: "valid" }]);
  const { data: att } = await db.from("attendees").select("status, marketing_consent").eq("event_id", ev.id).ilike("email", buyer.email).single();
  expect(att).toMatchObject({ status: "approved", marketing_consent: true });
  const { data: codeAfter } = await db.from("discount_codes").select("uses_count").eq("id", dc.id).single();
  expect(codeAfter?.uses_count, "jedno użycie kodu").toBe(1);
  const { data: tt } = await db.from("ticket_types").select("quantity_sold").eq("id", ticketId).single();
  expect(tt?.quantity_sold).toBe(1);

  // Kod z limitem 1 jest wyczerpany: druga osoba dostaje komunikat, nic nie powstaje.
  const second = { first: "Sara", last: "Spóźniona", email: `sara.rabat.17.${RUN}@e2e.test` };
  const ctx2 = await browser.newContext(NO_SESSION);
  const p2 = await ctx2.newPage();
  await p2.goto(`/e/${ev.slug}/checkout?ticket=${ticketId}`);
  await fillBuyer(p2, second);
  await p2.getByText("Mam kod rabatowy").click();
  await p2.locator("#co-discount").fill(code);
  await p2.getByRole("button", { name: /Przejd[zź] do p[lł]atno[sś]ci/ }).click();
  await expect(p2.getByText(/Kod rabatowy wyczerpany/)).toBeVisible();
  await expect(p2).not.toHaveURL(/checkout\/success/);
  await ctx2.close();

  const { data: codeFinal } = await db.from("discount_codes").select("uses_count").eq("id", dc.id).single();
  expect(codeFinal?.uses_count, "licznik bez zmian po odmowie").toBe(1);
  const { data: secondOrders } = await db.from("orders").select("id").eq("event_id", ev.id).ilike("buyer_email", second.email);
  expect(secondOrders).toHaveLength(0);
  const { data: ttFinal } = await db.from("ticket_types").select("quantity_sold").eq("id", ticketId).single();
  expect(ttFinal?.quantity_sold, "pula bez zmian po odmowie").toBe(1);
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("bilet darmowy przy zatwierdzaniu: uczestnik oczekujący, odrzucenie zwalnia miejsce w puli", async ({ page, browser }) => {
    const ev = await ensureEvent("akceptacja", { requires_approval: true });
    const db = admin();
    const ticketId = await insertTicketType(ev.id, { name: "E2E17 Wejściówka", price: 0, quantity_total: 10 });
    const who = { first: "Patryk", last: "Oczekujący", email: `patryk.akcept.17.${RUN}@e2e.test` };

    const ctx = await browser.newContext(NO_SESSION);
    const p = await ctx.newPage();
    await p.goto(`/e/${ev.slug}/checkout?ticket=${ticketId}`);
    await fillBuyer(p, who);
    await p.getByRole("button", { name: /Zarejestruj/ }).click();
    await expect(p).toHaveURL(/\/welcome\?.*status=pending/);
    await expect(p.getByText("Zgłoszenie przyjęte!")).toBeVisible();
    await expect(p.getByText("Oczekuje na zatwierdzenie", { exact: true })).toBeVisible();
    await waitForAppMail(who.email, /oczekuje na zatwierdzenie/i);
    await ctx.close();

    const { data: att } = await db.from("attendees").select("id, status").eq("event_id", ev.id).ilike("email", who.email).single();
    expect(att?.status, "zgłoszenie czeka na organizatora").toBe("pending");
    const mails = await appMails(who.email);
    expect(mails.filter((m) => /Potwierdzenie rejestracji/.test(m.subject)), "bez maila z biletem QR przed zatwierdzeniem").toHaveLength(0);
    const { data: ttBefore } = await db.from("ticket_types").select("quantity_sold").eq("id", ticketId).single();
    expect(ttBefore?.quantity_sold).toBe(1);

    // Organizator odrzuca zgłoszenie w panelu → bilet anulowany, miejsce wraca do puli.
    await page.goto(`/admin/events/${ev.id}/attendees`);
    const card = page.locator("[data-slot=card]", { hasText: who.email });
    await card.getByRole("button", { name: "Odrzuć" }).click();
    await expect.poll(async () => (await db.from("attendees").select("status").eq("id", att!.id).single()).data?.status).toBe("rejected");
    await expect.poll(async () => (await db.from("ticket_types").select("quantity_sold").eq("id", ticketId).single()).data?.quantity_sold).toBe(0);
    const { data: tickets } = await db.from("tickets").select("status").eq("attendee_id", att!.id);
    expect(tickets).toEqual([{ status: "cancelled" }]);
    const { data: orders } = await db.from("orders").select("status").eq("event_id", ev.id).ilike("buyer_email", who.email);
    expect(orders).toEqual([{ status: "cancelled" }]);
  });

  test("okno sprzedaży wpisane w czasie warszawskim: zapis w UTC, ten sam czas w panelu i egzekwowanie", async ({ page, browser }) => {
    const ev = await ensureEvent("okno");
    const db = admin();
    const now = Date.now();
    const startedAt = minuteFloor(now - 40 * 60_000); // sprzedaż ruszyła 40 min temu (czas warszawski)
    const until = minuteFloor(now + 2 * 24 * 3600_000);
    const endedAt = minuteFloor(now - 40 * 60_000); // sprzedaż skończyła się 40 min temu
    const OPEN = `E2E17 Okno otwarte ${RUN}`;
    const CLOSED = `E2E17 Okno zamknięte ${RUN}`;

    await page.goto(`/admin/events/${ev.id}/tickets?tab=typy`);
    const addType = async (name: string, start: Date | null, end: Date | null) => {
      await page.getByRole("button", { name: "Dodaj typ biletu" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#ct-name").fill(name);
      await dialog.locator("#ct-price").fill("0");
      if (start) await dialog.locator("#ct-start").fill(warsawLocal(start));
      if (end) await dialog.locator("#ct-end").fill(warsawLocal(end));
      await dialog.getByRole("button", { name: "Dodaj typ biletu" }).click();
      await expect(dialog.getByText("Typ biletu dodany.")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    };
    await addType(OPEN, startedAt, until);
    await addType(CLOSED, null, endedAt);

    const { data: rows } = await db.from("ticket_types").select("id, name, sales_start, sales_end").eq("event_id", ev.id);
    const open = rows!.find((r) => r.name === OPEN)!;
    const closed = rows!.find((r) => r.name === CLOSED)!;
    expect(Date.parse(open.sales_start), "początek zapisany jako właściwa chwila UTC").toBe(startedAt.getTime());
    expect(Date.parse(open.sales_end)).toBe(until.getTime());
    expect(closed.sales_start).toBeNull();
    expect(Date.parse(closed.sales_end)).toBe(endedAt.getTime());

    // Panel pokazuje te same godziny, które wpisał organizator.
    await page.reload();
    const openRow = page.locator("tr", { hasText: OPEN });
    await expect(openRow.getByText(`${panelDate(startedAt)} – ${panelDate(until)}`)).toBeVisible();
    await expect(page.locator("tr", { hasText: CLOSED }).getByText(`do ${panelDate(endedAt)}`)).toBeVisible();
    await openRow.locator("button:has(svg.lucide-pencil)").click();
    const edit = page.getByRole("dialog");
    await expect(edit.locator("#et-start")).toHaveValue(warsawLocal(startedAt));
    await expect(edit.locator("#et-end")).toHaveValue(warsawLocal(until));
    await page.keyboard.press("Escape");

    // Egzekwowanie: otwarte okno → formularz; zakończone 40 min temu → bilet niedostępny.
    const ctx = await browser.newContext(NO_SESSION);
    const p = await ctx.newPage();
    await p.goto(`/e/${ev.slug}/checkout?ticket=${open.id}`);
    await expect(p.locator("#co-first")).toBeVisible();
    await p.goto(`/e/${ev.slug}/checkout?ticket=${closed.id}`);
    await expect(p.getByText("Bilet niedostępny")).toBeVisible();
    await expect(p.locator("#co-first")).toHaveCount(0);

    // Ta sama osoba kupuje bilet w otwartym oknie.
    const who = { first: "Wiktor", last: "Okienny", email: `wiktor.okno.17.${RUN}@e2e.test` };
    await p.goto(`/e/${ev.slug}/checkout?ticket=${open.id}`);
    await fillBuyer(p, who);
    await p.getByRole("button", { name: /Zarejestruj/ }).click();
    await expect(p).toHaveURL(/checkout\/success/);
    await ctx.close();
  });

  // ─── Grywalizacja ──────────────────────────────────────────────────────────

  test("ponowne wydanie tej samej nagrody jest odrzucone i nie zmienia magazynu", async ({ page }) => {
    const ev = await ensureEvent("nagrody");
    const db = admin();
    const who = { first: "Natalia", last: `Nagrodowa${RUN}`, email: `natalia.nagroda.17.${RUN}@e2e.test` };
    await insertAttendee(ev.id, who, { points: 500 });
    const rewardName = `Kubek E2E17 ${RUN}`;
    const { data: reward, error } = await db
      .from("rewards")
      .insert({ event_id: ev.id, name: rewardName, points_required: 50, stock: 5 })
      .select("id")
      .single();
    if (error || !reward) throw new Error(`[17] nagroda: ${error?.message}`);

    const stale = await page.context().newPage();
    await page.goto(`/admin/events/${ev.id}/rewards`);
    await stale.goto(`/admin/events/${ev.id}/rewards`);
    const name = `${who.first} ${who.last}`;
    const section = await redeemSectionFor(page, name);
    const staleSection = await redeemSectionFor(stale, name);

    await redeemRow(section, rewardName).getByRole("button", { name: "Wydaj" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Potwierdź" }).click();
    await expect(section.getByText("Nagroda wydana.")).toBeVisible();

    await redeemRow(staleSection, rewardName).getByRole("button", { name: "Wydaj" }).click();
    await stale.getByRole("alertdialog").getByRole("button", { name: "Potwierdź" }).click();
    await expect(staleSection.getByText("Uczestnik już odebrał tę nagrodę.")).toBeVisible();

    const { data: after } = await db.from("rewards").select("stock").eq("id", reward.id).single();
    expect(after?.stock, "magazyn: 5 − 1 wydanie, odrzucone nie zmienia stanu").toBe(4);
    const { data: redemptions } = await db.from("reward_redemptions").select("attendee_id").eq("reward_id", reward.id);
    expect(redemptions).toHaveLength(1);
    await stale.close();
  });
});

test("stoisko przy wyłączonej grywalizacji: zwykła wizyta, bez punktów i bez zaliczenia questa", async ({ browser }) => {
  const ev = await ensureEvent("stoisko", { gamification_enabled: false });
  const db = admin();
  const partnerName = `Stoisko E2E17 ${RUN}`;
  const { data: partner, error } = await db
    .from("partners")
    .insert({ event_id: ev.id, name: partnerName, tier: "silver" })
    .select("id, qr_code_token")
    .single();
  if (error || !partner) throw new Error(`[17] partner: ${error?.message}`);
  const { data: quest, error: qErr } = await db
    .from("quests")
    .insert({ event_id: ev.id, partner_id: partner.id, type: "booth_visit", title: `Quest stoiska ${RUN}`, points_value: 70, is_active: true })
    .select("id")
    .single();
  if (qErr || !quest) throw new Error(`[17] quest: ${qErr?.message}`);
  const who = { first: "Bogna", last: "Stoiskowa", email: `bogna.stoisko.17.${RUN}@e2e.test` };
  const att = await insertAttendee(ev.id, who);

  const { ctx, page } = await participantPage(browser, ev.slug, att.qr_code_token, who.first);
  await page.goto(`/e/${ev.slug}/booth/${partner.qr_code_token}`);
  await expect(page.getByText(partnerName).first()).toBeVisible();
  await expect(page.getByText("+70 pkt")).toHaveCount(0);
  await page.getByRole("button", { name: "Zarejestruj odwiedziny" }).click();
  await expect(page.getByText(`Dziękujemy za odwiedziny stoiska ${partnerName}.`)).toBeVisible();
  await expect(page.getByText("Wizyta zapisana")).toBeVisible();
  await expect(page.getByText(/\+\d+ pkt/)).toHaveCount(0);
  await ctx.close();

  const { data: me } = await db.from("attendees").select("points").eq("id", att.id).single();
  expect(me?.points, "bez punktów przy wyłączonej grywalizacji").toBe(0);
  const { data: completions } = await db.from("quest_completions").select("quest_id").eq("attendee_id", att.id);
  expect(completions).toHaveLength(0);
  const { data: checkins } = await db.from("checkins").select("id").eq("attendee_id", att.id).eq("partner_id", partner.id);
  expect(checkins, "wizyta zapisana").toHaveLength(1);

  // Grywalizacja wyłączona po wyświetleniu stoiska z questem: odpowiedź nie jest oceniana.
  const who2 = { first: "Cyprian", last: "Spóźniony", email: `cyprian.stoisko.17.${RUN}@e2e.test` };
  const att2 = await insertAttendee(ev.id, who2);
  await db.from("events").update({ gamification_enabled: true }).eq("id", ev.id);
  const second = await participantPage(browser, ev.slug, att2.qr_code_token, who2.first);
  await second.page.goto(`/e/${ev.slug}/booth/${partner.qr_code_token}`);
  await expect(second.page.getByText("+70 pkt")).toBeVisible();
  await db.from("events").update({ gamification_enabled: false }).eq("id", ev.id);
  await second.page.getByRole("button", { name: "Zarejestruj odwiedziny" }).click();
  await expect(second.page.getByText("Stoisko zmieniło zadanie — odśwież stronę.")).toBeVisible();
  await second.ctx.close();
  const { data: me2 } = await db.from("attendees").select("points").eq("id", att2.id).single();
  expect(me2?.points).toBe(0);
  const { data: completions2 } = await db.from("quest_completions").select("quest_id").eq("attendee_id", att2.id);
  expect(completions2).toHaveLength(0);
});

// ─── Wydarzenie zawieszone / usunięte ────────────────────────────────────────

test("link recepcji przestaje działać po zawieszeniu i po usunięciu wydarzenia", async ({ browser }) => {
  const ev = await ensureEvent("recepcja");
  const db = admin();
  const token = crypto.randomUUID();
  await db.from("events").update({ reception_token: token }).eq("id", ev.id);
  await insertAttendee(ev.id, { first: "Roksana", last: "Recepcyjna17", email: `roksana.17.${RUN}@e2e.test` });
  const otherSlug = state().events.open.slug;

  const ctx = await browser.newContext(NO_SESSION);
  const s = await ctx.newPage();
  const own = `/e/${ev.slug}/recepcja/${token}`;
  const viaOther = `/e/${otherSlug}/recepcja/${token}`;
  await s.goto(own);
  await expect(s.getByText("Roksana Recepcyjna17")).toBeVisible();

  // Zawieszenie wydarzenia: link nieaktywny (także pod adresem z innym slugiem).
  const { error: susErr } = await db.from("event_suspensions").insert({ event_id: ev.id, reason: "E2E17" });
  if (susErr) throw new Error(`[17] zawieszenie: ${susErr.message}`);
  await s.goto(viaOther);
  await expect(s.getByText("Link nieaktywny")).toBeVisible();
  await s.goto(own);
  await expect(s.getByText("Roksana Recepcyjna17")).toHaveCount(0);
  await expect(s.getByRole("button", { name: "Zamelduj" })).toHaveCount(0);

  // Po zdjęciu zawieszenia link znów działa…
  await db.from("event_suspensions").delete().eq("event_id", ev.id);
  await s.goto(own);
  await expect(s.getByText("Roksana Recepcyjna17")).toBeVisible();

  // …a po usunięciu wydarzenia — już nie.
  await db.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", ev.id);
  await s.goto(viaOther);
  await expect(s.getByText("Link nieaktywny")).toBeVisible();
  await s.goto(own);
  await expect(s.getByText("Roksana Recepcyjna17")).toHaveCount(0);
  await expect(s.getByRole("button", { name: "Zamelduj" })).toHaveCount(0);
  await ctx.close();
});

// ─── Konta ───────────────────────────────────────────────────────────────────

test("podwójne wysłanie formularza organizacji tworzy dokładnie jedną organizację", async ({ browser }) => {
  const db = admin();
  const email = `nowy.organizator.17.${RUN}@e2e.test`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`[17] konto: ${error?.message}`);
  const userId = created.user.id;

  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  await loginWithMagicLink(page, "/login", email);
  await expect(page).toHaveURL(/\/onboarding/);
  // Druga karta z tym samym formularzem (np. otwarta wcześniej).
  const stale = await ctx.newPage();
  await stale.goto("/onboarding");
  await stale.locator("#name").fill(`Druga Karta ${RUN}`);

  await page.locator("#name").fill(`Firma Podwójna ${RUN}`);
  // Dwa wysłania tego samego formularza jedno po drugim (podwójne kliknięcie / Enter).
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>("form:has(#name)")!;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page).toHaveURL(/\/admin(?!\/platform)/);

  await stale.getByRole("button", { name: "Utwórz organizację" }).click();
  await expect(stale).toHaveURL(/\/admin/);
  await expect(stale).not.toHaveURL(/\/onboarding/);

  const { data: orgs } = await db.from("organizations").select("id, name").eq("owner_user_id", userId);
  expect(orgs, "jedna organizacja na konto").toHaveLength(1);
  expect(orgs![0].name).toBe(`Firma Podwójna ${RUN}`);

  // Baza też pilnuje jednej organizacji na właściciela (unikalny indeks).
  const { error: dupErr } = await db
    .from("organizations")
    .insert({ name: "Duplikat", slug: `e2e-17-dup-${RUN}`, owner_user_id: userId, billing_email: email });
  expect(dupErr?.code).toBe("23505");
  await ctx.close();
});

// ─── Pliki ───────────────────────────────────────────────────────────────────

test("panel partnera: plik i logo ponad 4 MB odrzucone z komunikatem po polsku", async ({ browser }) => {
  const ev = await ensureEvent("partner");
  const db = admin();
  const partnerName = `Partner Pliki ${RUN}`;
  const email = `partner.pliki.17.${RUN}@e2e.test`;
  const { data: partner, error } = await db.from("partners").insert({ event_id: ev.id, name: partnerName, tier: "gold" }).select("id").single();
  if (error || !partner) throw new Error(`[17] partner: ${error?.message}`);
  const { data: user, error: userErr } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !user.user) throw new Error(`[17] konto partnera: ${userErr?.message}`);
  const { error: accErr } = await db
    .from("partner_access")
    .insert({ partner_id: partner.id, event_id: ev.id, email, user_id: user.user.id, accepted_at: new Date().toISOString() });
  if (accErr) throw new Error(`[17] dostęp partnera: ${accErr.message}`);

  const ctx = await browser.newContext(NO_SESSION);
  const p = await ctx.newPage();
  await loginWithMagicLink(p, "/partner/login", email);
  await expect(p).toHaveURL(new RegExp(`/partner/${partner.id}`));

  const big = Buffer.alloc(Math.round(4.5 * 1024 * 1024), 1);

  // Materiał 4,5 MB (mieścił się w dawnym limicie 5 MB, ale nie w limicie żądania platformy).
  await p.goto(`/partner/${partner.id}?tab=materialy`);
  await expect(p.getByText(/do 4(,0)? MB/)).toBeVisible();
  await p.locator("#m-title").fill("Katalog za duży");
  await p.locator("#m-file").setInputFiles({ name: "katalog.pdf", mimeType: "application/pdf", buffer: big });
  await p.getByRole("button", { name: "Dodaj materiał" }).click();
  await expect(p.getByText("Plik jest za duży — maksymalny rozmiar to 4 MB.")).toBeVisible();

  // Logo 4,5 MB w wizytówce.
  await p.goto(`/partner/${partner.id}?tab=wizytowka`);
  await expect(p.getByText("JPG, PNG lub WebP, do 4 MB.", { exact: false })).toBeVisible();
  await p.locator("#p-logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: big });
  await p.getByRole("button", { name: "Wyślij do akceptacji" }).click();
  await expect(p.getByText("Maksymalny rozmiar: 4MB.")).toBeVisible();
  await ctx.close();

  const { data: materials } = await db.from("partner_materials").select("id").eq("partner_id", partner.id);
  expect(materials, "bez zapisanego materiału").toHaveLength(0);
  const { data: drafts } = await db.from("partner_profile_drafts").select("partner_id").eq("partner_id", partner.id);
  expect(drafts, "bez szkicu wizytówki").toHaveLength(0);
});
