import { expect, test, type Page } from "@playwright/test";
import { admin, loginWithMagicLink, state } from "../helpers";

// Bilety (panel organizatora i zakup) oraz recepcja — przypadki brzegowe:
// kod rabatowy i płatny typ biletu z panelu, płatność bez skonfigurowanego Przelewy24,
// wyprzedana pula, licznik i filtry recepcji, link obsługi (generowanie / odwołanie),
// osoby niezatwierdzone poza listą recepcji.
//
// Plik jest niezależny od innych: loguje się sam i tworzy własne wydarzenie w organizacji E2E.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-12.json";
// Kupujący, obsługa recepcji: czysta przeglądarka, bez sesji organizatora.
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const SUFFIX = Date.now().toString(36);
const EVENT_NAME = "E2E12 Bilety i Recepcja";
const DISCOUNT_CODE = `e2e12rabat${SUFFIX}`;
const PAID_TICKET = "E2E12 Bilet płatny";
const SOLD_OUT_TICKET = "E2E12 Wejściówka limitowana";

type Fixture = { eventId: string; slug: string; organizationId: string };
let fixture: Fixture | null = null;
let paidTicketId: string | null = null;

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Własne opublikowane wydarzenie w organizacji organizatora E2E (tworzone raz na plik). */
async function ensureEvent(): Promise<Fixture> {
  if (fixture) return fixture;
  const db = admin();
  const { data: org, error: orgErr } = await db.from("organizations").select("id").eq("slug", "e2e-org").single();
  if (orgErr || !org) throw new Error(`[12] organizacja E2E: ${orgErr?.message ?? "brak"}`);
  const slug = `e2e-12-bilety-${SUFFIX}`;
  const { data: ev, error } = await db
    .from("events")
    .insert({
      organization_id: org.id,
      slug,
      name: EVENT_NAME,
      status: "published",
      requires_approval: false,
      timezone: "Europe/Warsaw",
      starts_at: at(10, 8),
      ends_at: at(10, 16),
      location: "Łódź, Hala Expo",
    })
    .select("id, slug")
    .single();
  if (error || !ev) throw new Error(`[12] wydarzenie: ${error?.message ?? "brak"}`);
  fixture = { eventId: ev.id, slug: ev.slug, organizationId: org.id };
  return fixture;
}

/** Adres e-mail tylko z ASCII (np. „Paweł Oczekujący” → pawel.oczekujacy.12@e2e.test). */
function emailFor(first: string, last: string) {
  const ascii = (v: string) =>
    v.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${ascii(first)}.${ascii(last)}.12@e2e.test`;
}

/** Karta typu biletu na publicznej stronie wydarzenia. */
function ticketCard(page: Page, name: string) {
  return page.locator("div.rounded-xl.p-5.shadow-sm").filter({ has: page.getByText(name, { exact: true }) });
}

async function addAttendee(
  eventId: string,
  first: string,
  last: string,
  status: "approved" | "pending" | "rejected",
  checkedIn = false,
) {
  const { data, error } = await admin()
    .from("attendees")
    .insert({
      event_id: eventId,
      first_name: first,
      last_name: last,
      email: emailFor(first, last),
      status,
      checked_in_at: checkedIn ? new Date().toISOString() : null,
    })
    .select("id, qr_code_token, check_in_token")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Licznik recepcji „N / M przyszło”. */
function receptionCounter(page: Page) {
  return page.locator("div.flex.items-baseline", { hasText: "przyszło" }).first();
}

function receptionRow(page: Page, name: string) {
  return page.locator("div.rounded-lg.border", { hasText: name });
}

async function fillBuyer(page: Page, who: { first: string; last: string; email: string }) {
  await page.locator("#co-first").fill(who.first);
  await page.locator("#co-last").fill(who.last);
  await page.locator("#co-email").fill(who.email);
  await page.locator("#co-gdpr").click();
}

test("logowanie organizatora (sesja dla testów biletów i recepcji)", async ({ page }) => {
  const { organizerEmail } = state();
  await ensureEvent();
  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("panel biletów: nowy kod rabatowy (wielkie litery, bez duplikatu)", async ({ page }) => {
    const { eventId } = await ensureEvent();
    await page.goto(`/admin/events/${eventId}/tickets?tab=kody`);
    await expect(page.getByText("Brak kodów rabatowych.")).toBeVisible();

    await page.getByRole("button", { name: "Dodaj kod" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Nowy kod rabatowy" })).toBeVisible();
    await dialog.locator("#dc-code").fill(DISCOUNT_CODE);
    await dialog.locator("#dc-value").fill("20");
    await dialog.locator("#dc-maxuses").fill("5");
    await dialog.getByRole("button", { name: "Dodaj kod" }).click();
    await expect(dialog.getByText("Kod rabatowy dodany.")).toBeVisible();

    const upper = DISCOUNT_CODE.toUpperCase();
    const { data: codes } = await admin()
      .from("discount_codes")
      .select("code, kind, value, max_uses, uses_count, enabled")
      .eq("event_id", eventId);
    expect(codes).toHaveLength(1);
    expect(codes![0]).toMatchObject({ code: upper, kind: "percent", value: 20, max_uses: 5, uses_count: 0, enabled: true });

    // Ten sam kod drugi raz (inną wielkością liter): czytelny błąd, bez drugiego rekordu.
    await dialog.locator("#dc-code").fill(upper.toLowerCase());
    await dialog.locator("#dc-value").fill("10");
    await dialog.getByRole("button", { name: "Dodaj kod" }).click();
    await expect(dialog.getByText(/ju[zż] istnieje/i)).toBeVisible();
    const { data: after } = await admin().from("discount_codes").select("id").eq("event_id", eventId);
    expect(after).toHaveLength(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const row = page.locator("tr", { hasText: upper });
    await expect(row).toBeVisible();
    await expect(row.getByText("20%")).toBeVisible();
    await expect(row.getByText("0 / 5")).toBeVisible();
  });

  test("panel biletów: nowy płatny typ biletu z ceną i pulą", async ({ page }) => {
    const { eventId } = await ensureEvent();
    await page.goto(`/admin/events/${eventId}/tickets?tab=typy`);
    await expect(page.getByText(/Brak typów biletów/)).toBeVisible();

    await page.getByRole("button", { name: "Dodaj typ biletu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Nowy typ biletu" })).toBeVisible();
    await dialog.locator("#ct-name").fill(PAID_TICKET);
    await dialog.locator("#ct-desc").fill("Pełny dostęp do sal wykładowych");
    await dialog.locator("#ct-price").fill("49.99");
    await dialog.locator("#ct-qty").fill("20");
    await dialog.getByRole("button", { name: "Dodaj typ biletu" }).click();
    await expect(dialog.getByText("Typ biletu dodany.")).toBeVisible();

    const { data: tt } = await admin()
      .from("ticket_types")
      .select("id, price, quantity_total, quantity_sold, enabled")
      .eq("event_id", eventId)
      .eq("name", PAID_TICKET)
      .single();
    expect(tt).toMatchObject({ price: 4999, quantity_total: 20, quantity_sold: 0, enabled: true });
    paidTicketId = tt!.id;

    await page.keyboard.press("Escape");
    const row = page.locator("tr", { hasText: PAID_TICKET });
    await expect(row).toBeVisible();
    await expect(row.getByText("49,99 PLN")).toBeVisible();
    await expect(row.getByText(/0\s*\/\s*20/)).toBeVisible();
  });

  test("płatny bilet bez skonfigurowanego Przelewy24: komunikat po polsku, bez uczestnika i zamówienia", async ({ browser }) => {
    const { eventId, slug, organizationId } = await ensureEvent();
    expect(paidTicketId, "płatny typ biletu z poprzedniego testu").toBeTruthy();

    const { data: cfg } = await admin()
      .from("organizer_payment_config")
      .select("id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    expect(cfg, "warunek testu: organizacja E2E nie ma konfiguracji Przelewy24").toBeNull();

    const buyerCtx = await browser.newContext(NO_SESSION);
    const p = await buyerCtx.newPage();
    const email = `kupujacy.p24.12@e2e.test`;

    // Strona wydarzenia → „Kup bilet” prowadzi do formularza płatnego biletu.
    await p.goto(`/e/${slug}`);
    const card = ticketCard(p, PAID_TICKET);
    await expect(card.getByText("49,99 PLN")).toBeVisible();
    await card.getByRole("link", { name: "Kup bilet" }).click();
    await expect(p).toHaveURL(new RegExp(`/checkout\\?ticket=${paidTicketId}`));
    await expect(p.getByText("KUP BILET", { exact: true })).toBeVisible();

    await fillBuyer(p, { first: "Krystian", last: "Kupujący", email });
    await p.getByText("Mam kod rabatowy").click();
    await p.locator("#co-discount").fill(DISCOUNT_CODE);
    await p.getByRole("button", { name: /Przejd[zź] do p[lł]atno[sś]ci/ }).click();

    await expect(p.getByText(/P[lł]atno[sś]ci nie s[aą] skonfigurowane/i)).toBeVisible();
    // Brak przekierowania do bramki, dane w formularzu zostają.
    await expect(p).toHaveURL(/\/checkout\?ticket=/);
    await expect(p.locator("#co-email")).toHaveValue(email);

    const db = admin();
    const { data: attendees } = await db.from("attendees").select("id").eq("event_id", eventId).ilike("email", email);
    expect(attendees, "bez uczestnika").toHaveLength(0);
    const { data: orders } = await db.from("orders").select("id").eq("event_id", eventId).ilike("buyer_email", email);
    expect(orders, "bez zamówienia").toHaveLength(0);
    const { data: tickets } = await db.from("tickets").select("id").eq("event_id", eventId).ilike("holder_email", email);
    expect(tickets, "bez biletu").toHaveLength(0);
    const { data: tt } = await db.from("ticket_types").select("quantity_sold").eq("id", paidTicketId!).single();
    expect(tt?.quantity_sold, "pula nie jest zarezerwowana").toBe(0);
    const { data: dc } = await db.from("discount_codes").select("uses_count").eq("code", DISCOUNT_CODE.toUpperCase()).single();
    expect(dc?.uses_count, "kod rabatowy nie jest zużyty").toBe(0);
    await buyerCtx.close();
  });

  test("wyprzedana pula: „Wyprzedany” na stronie i w panelu, zakup odrzucony", async ({ page, browser }) => {
    const { eventId, slug } = await ensureEvent();
    const db = admin();
    const { data: tt, error } = await db
      .from("ticket_types")
      .insert({ event_id: eventId, name: SOLD_OUT_TICKET, price: 0, quantity_total: 5, position: 10 })
      .select("id")
      .single();
    if (error || !tt) throw new Error(error?.message ?? "typ biletu");

    // Jedna opłacona sprzedaż, a potem organizator (przez bazę) zmniejsza pulę do 1 → pula wyczerpana.
    const { data: order, error: orderErr } = await db
      .from("orders")
      .insert({
        event_id: eventId,
        buyer_name: "Sprzedany Wcześniej",
        buyer_email: "sprzedany.12@e2e.test",
        status: "paid",
        total_amount: 0,
        currency: "PLN",
        p24_session_id: `free_e2e12_${crypto.randomUUID()}`,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "zamówienie");
    await db.from("order_items").insert({ order_id: order.id, ticket_type_id: tt.id, quantity: 1, unit_price: 0, line_total: 0 });
    await db.from("ticket_types").update({ quantity_total: 1, quantity_sold: 1 }).eq("id", tt.id);

    // Panel organizatora: odznaka „Wyprzedany” przy typie biletu.
    await page.goto(`/admin/events/${eventId}/tickets?tab=typy`);
    const adminRow = page.locator("tr", { hasText: SOLD_OUT_TICKET });
    await expect(adminRow.getByText(/1\s*\/\s*1/)).toBeVisible();
    await expect(adminRow.getByText("Wyprzedany")).toBeVisible();

    const buyerCtx = await browser.newContext(NO_SESSION);
    const p = await buyerCtx.newPage();
    // Strona wydarzenia: zablokowany przycisk „Wyprzedany” zamiast linku do zakupu.
    await p.goto(`/e/${slug}`);
    const card = ticketCard(p, SOLD_OUT_TICKET);
    await expect(card.getByRole("button", { name: "Wyprzedany" })).toBeDisabled();
    await expect(card.getByRole("link", { name: /Zarejestruj się bezpłatnie|Kup bilet/ })).toHaveCount(0);

    // Bezpośredni adres zakupu: odmowa (od razu albo po wysłaniu formularza).
    const email = "spozniony.12@e2e.test";
    await p.goto(`/e/${slug}/checkout?ticket=${tt.id}`);
    const form = p.locator("#co-first");
    if (await form.count()) {
      await fillBuyer(p, { first: "Szymon", last: "Spóźniony", email });
      await p.getByRole("button", { name: /Zarejestruj/ }).click();
      await expect(p.getByText(/Brak dost[eę]pnych miejsc|wyprzedan/i)).toBeVisible();
      await expect(p).not.toHaveURL(/checkout\/success/);
    } else {
      await expect(p.getByText(/niedost[eę]pny|wyprzedan/i).first()).toBeVisible();
    }

    const { data: attendees } = await db.from("attendees").select("id").eq("event_id", eventId).ilike("email", email);
    expect(attendees, "bez uczestnika po odmowie").toHaveLength(0);
    const { data: ttAfter } = await db.from("ticket_types").select("quantity_sold").eq("id", tt.id).single();
    expect(ttAfter?.quantity_sold, "brak nadsprzedaży").toBe(1);
    await buyerCtx.close();
  });

  test("recepcja: licznik N/M, filtry Obecni / Jeszcze nie, oczekujący poza listą", async ({ page }) => {
    const { eventId } = await ensureEvent();
    await addAttendee(eventId, "Alicja", "Recepcyjna", "approved", true);
    await addAttendee(eventId, "Bartosz", "Recepcyjny", "approved");
    await addAttendee(eventId, "Cezary", "Recepcyjny", "approved");
    await addAttendee(eventId, "Paweł", "Oczekujący", "pending");
    await addAttendee(eventId, "Roman", "Odrzucony", "rejected");

    await page.goto(`/admin/events/${eventId}/reception`);
    await expect(receptionCounter(page)).toHaveText(/^\s*1\s*\/\s*3 przyszło\s*$/);

    // Tylko zatwierdzeni na liście; oczekujący i odrzucony — nie (także po wyszukaniu).
    await expect(receptionRow(page, "Alicja Recepcyjna")).toBeVisible();
    await expect(receptionRow(page, "Bartosz Recepcyjny")).toBeVisible();
    await expect(receptionRow(page, "Cezary Recepcyjny")).toBeVisible();
    await expect(page.getByText("Paweł Oczekujący")).toHaveCount(0);
    await expect(page.getByText("Roman Odrzucony")).toHaveCount(0);
    const search = page.getByPlaceholder("Szukaj po nazwisku…");
    await search.fill("Oczekujący");
    await expect(page.getByText("Brak wyników")).toBeVisible();
    await search.fill("");

    // Filtr „Obecni”: tylko zameldowana Alicja.
    await page.getByRole("button", { name: "Obecni", exact: true }).click();
    await expect(receptionRow(page, "Alicja Recepcyjna")).toBeVisible();
    await expect(receptionRow(page, "Alicja Recepcyjna").getByRole("button", { name: "Cofnij zameldowanie" })).toBeVisible();
    await expect(receptionRow(page, "Bartosz Recepcyjny")).toHaveCount(0);
    await expect(receptionRow(page, "Cezary Recepcyjny")).toHaveCount(0);

    // Filtr „Jeszcze nie”: Bartosz i Cezary, bez Alicji.
    await page.getByRole("button", { name: "Jeszcze nie", exact: true }).click();
    await expect(receptionRow(page, "Alicja Recepcyjna")).toHaveCount(0);
    await expect(receptionRow(page, "Bartosz Recepcyjny")).toBeVisible();
    await expect(receptionRow(page, "Cezary Recepcyjny")).toBeVisible();

    // Zameldowanie przy aktywnym filtrze: licznik rośnie, osoba znika z „Jeszcze nie”.
    await receptionRow(page, "Bartosz Recepcyjny").getByRole("button", { name: "Zamelduj" }).click();
    await expect(receptionCounter(page)).toHaveText(/^\s*2\s*\/\s*3 przyszło\s*$/);
    await expect(receptionRow(page, "Bartosz Recepcyjny")).toHaveCount(0);
    await expect(receptionRow(page, "Cezary Recepcyjny")).toBeVisible();

    await page.getByRole("button", { name: "Obecni", exact: true }).click();
    await expect(receptionRow(page, "Alicja Recepcyjna")).toBeVisible();
    await expect(receptionRow(page, "Bartosz Recepcyjny")).toBeVisible();
    await expect(receptionRow(page, "Cezary Recepcyjny")).toHaveCount(0);

    await page.getByRole("button", { name: "Wszyscy", exact: true }).click();
    await expect(page.locator("div.rounded-lg.border", { hasText: /Recepcyjn/ })).toHaveCount(3);

    const { data: bartosz } = await admin()
      .from("attendees")
      .select("checked_in_at")
      .eq("email", emailFor("Bartosz", "Recepcyjny"))
      .single();
    expect(bartosz?.checked_in_at).not.toBeNull();
    // Oczekujący nadal niezameldowany i z niezmienionym statusem.
    const { data: pawel } = await admin()
      .from("attendees")
      .select("status, checked_in_at")
      .eq("email", emailFor("Paweł", "Oczekujący"))
      .single();
    expect(pawel).toMatchObject({ status: "pending", checked_in_at: null });
  });

  test("link obsługi recepcji: generowanie, nowy link unieważnia stary, odwołanie z panelu", async ({ page, browser }) => {
    const { eventId, slug } = await ensureEvent();
    const db = admin();
    await db.from("events").update({ reception_token: null }).eq("id", eventId);
    const readToken = async () =>
      (await db.from("events").select("reception_token").eq("id", eventId).single()).data?.reception_token as string | null;

    await page.goto(`/admin/events/${eventId}/reception`);
    await page.getByRole("button", { name: "Link recepcji" }).click();
    const copy = page.getByRole("button", { name: "Kopiuj link" });
    await expect(copy).toBeVisible();

    await expect.poll(readToken, { message: "token recepcji w bazie" }).not.toBeNull();
    const first = (await readToken())!;
    const firstPath = `/e/${slug}/recepcja/${first}`;
    await expect(copy).toHaveAttribute("title", new RegExp(`${firstPath.replace(/[/.-]/g, "\\$&")}$`));

    // Obsługa otwiera link bez logowania: lista zatwierdzonych, bez oczekujących.
    const staffCtx = await browser.newContext(NO_SESSION);
    const s = await staffCtx.newPage();
    await s.goto(firstPath);
    await expect(s.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
    await expect(receptionRow(s, "Cezary Recepcyjny")).toBeVisible();
    await expect(s.getByText("Paweł Oczekujący")).toHaveCount(0);

    // Nowy link unieważnia stary.
    await page.getByTitle("Generuj nowy link (unieważnia stary)").click();
    await expect.poll(readToken, { message: "nowy token recepcji" }).not.toBe(first);
    const second = (await readToken())!;
    expect(second).not.toBeNull();
    await s.reload();
    await expect(s.getByText("Link nieaktywny")).toBeVisible();
    const secondPath = `/e/${slug}/recepcja/${second}`;
    await s.goto(secondPath);
    await expect(receptionRow(s, "Cezary Recepcyjny")).toBeVisible();

    // Odwołanie z panelu: w bazie brak tokenu, przycisk wraca do „Link recepcji”, link nieaktywny.
    await page.getByTitle("Odwołaj link recepcji").click();
    await expect(page.getByRole("button", { name: "Link recepcji" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kopiuj link" })).toHaveCount(0);
    await expect.poll(readToken, { message: "token odwołany" }).toBeNull();
    await s.reload();
    await expect(s.getByText("Link nieaktywny")).toBeVisible();
    await expect(s.getByRole("button", { name: "Zamelduj" })).toHaveCount(0);

    // Po przeładowaniu panelu organizatora nadal brak linku.
    await page.reload();
    await expect(page.getByRole("button", { name: "Link recepcji" })).toBeVisible();
    await staffCtx.close();
  });
});
