import { expect, test, type Page } from "@playwright/test";
import { APP_URL } from "../env";
import { admin, appMails, linksIn, loginWithMagicLink, state, waitForAppMail } from "../helpers";

// Uczestnicy: import listy gości (wklejka z Excela i plik CSV w Windows-1250) oraz zbiorcza
// i pojedyncza wysyłka biletów QR. Import nie wysyła maili; bilety idą tylko do zaimportowanych
// gości bez biletu, samodzielnie zapisani nie są liczeni w kolejce.
//
// Plik jest niezależny od innych: loguje się sam i tworzy własne wydarzenia w organizacji E2E.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-14.json";
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const SUFFIX = Date.now().toString(36);
const EVENT_NAME = "E2E14 Import Gości";
const OTHER_EVENT_NAME = "E2E14 Inne Wydarzenie";

const JAN = { first: "Jan", last: "Importowany", email: "jan.importowany.14@e2e.test", company: "Firma Alfa" };
const OLA = { first: "Ola", last: "Importowana", email: "ola.importowana.14@e2e.test", company: "Firma Beta" };
// Ten adres jest już uczestnikiem INNEGO wydarzenia organizatora.
const KASIA = { first: "Kasia", last: "Obca", email: "kasia.obca.14@e2e.test", company: "" };
const GUESTS = [JAN, OLA, KASIA];
// Zapisała się sama (imported_at = NULL).
const SYLWIA = { first: "Sylwia", last: "Samodzielna", email: "sylwia.samodzielna.14@e2e.test" };

// Wiersz 1: nagłówek. Wiersze 4–6: błędne. Kolumny rozdzielone tabulatorem jak przy wklejaniu z Excela.
const PASTED_LIST = [
  "Imię\tNazwisko\tE-mail\tFirma",
  `${JAN.first}\t${JAN.last}\t${JAN.email}\t${JAN.company}`,
  `${OLA.first}\t${OLA.last}\t${OLA.email}\t${OLA.company}`,
  "Zły\tAdres\tzly-adres-bez-malpy\tFirma Gamma",
  "Bez\t\tbez.nazwiska.14@e2e.test\tFirma Delta",
  `Jan\tDuplikat\t${JAN.email.toUpperCase()}\tFirma Epsilon`,
  `${KASIA.first}\t${KASIA.last}\t${KASIA.email}\t`,
].join("\n");

type Fixture = { eventId: string; slug: string; otherEventId: string };
let fixture: Fixture | null = null;

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function ensureEvents(): Promise<Fixture> {
  if (fixture) return fixture;
  const db = admin();
  const { data: org, error: orgErr } = await db.from("organizations").select("id").eq("slug", "e2e-org").single();
  if (orgErr || !org) throw new Error(`[14] organizacja E2E: ${orgErr?.message ?? "brak"}`);
  const base = {
    organization_id: org.id,
    status: "published",
    requires_approval: false,
    timezone: "Europe/Warsaw",
    starts_at: at(12, 8),
    ends_at: at(12, 16),
    location: "Łódź, Hala Expo",
  };
  const { data: ev, error } = await db
    .from("events")
    .insert({ ...base, slug: `e2e-14-import-${SUFFIX}`, name: EVENT_NAME })
    .select("id, slug")
    .single();
  if (error || !ev) throw new Error(`[14] wydarzenie: ${error?.message ?? "brak"}`);
  const { data: other, error: otherErr } = await db
    .from("events")
    .insert({ ...base, slug: `e2e-14-inne-${SUFFIX}`, name: OTHER_EVENT_NAME })
    .select("id")
    .single();
  if (otherErr || !other) throw new Error(`[14] drugie wydarzenie: ${otherErr?.message ?? "brak"}`);

  const { error: aErr } = await db.from("attendees").insert([
    // Kasia jest już na innym wydarzeniu — import do tego wydarzenia ma ją mimo to dodać.
    { event_id: other.id, first_name: KASIA.first, last_name: KASIA.last, email: KASIA.email, status: "approved" },
    // Osoba zapisana samodzielnie na to wydarzenie (nie z importu).
    { event_id: ev.id, first_name: SYLWIA.first, last_name: SYLWIA.last, email: SYLWIA.email, status: "approved" },
  ]);
  if (aErr) throw new Error(`[14] uczestnicy startowi: ${aErr.message}`);
  fixture = { eventId: ev.id, slug: ev.slug, otherEventId: other.id };
  return fixture;
}

async function attendeesOf(eventId: string) {
  const { data, error } = await admin()
    .from("attendees")
    .select("id, first_name, last_name, email, company, status, networking_visible, imported_at, ticket_sent_at, gdpr_consent_at, checked_in_at, qr_code_token")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data!;
}

function ticketMails(email: string) {
  return appMails(email).then((list) => list.filter((m) => /Potwierdzenie rejestracji/.test(m.subject)));
}

function queueCounter(page: Page) {
  return page.getByText(/^Bilety do wysłania: \d+$/);
}

function attendeeCard(page: Page, email: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: email });
}

/** Kodowanie Windows-1250 (ASCII + polskie litery) — tak zapisuje CSV polski Excel. */
function toWindows1250(text: string): Buffer {
  const map: Record<string, number> = {
    ą: 0xb9, ć: 0xe6, ę: 0xea, ł: 0xb3, ń: 0xf1, ó: 0xf3, ś: 0x9c, ź: 0x9f, ż: 0xbf,
    Ą: 0xa5, Ć: 0xc6, Ę: 0xca, Ł: 0xa3, Ń: 0xd1, Ó: 0xd3, Ś: 0x8c, Ź: 0x8f, Ż: 0xaf,
  };
  return Buffer.from(
    [...text].map((ch) => {
      if (map[ch] !== undefined) return map[ch];
      const code = ch.charCodeAt(0);
      if (code > 0x7f) throw new Error(`znak spoza mapy: ${ch}`);
      return code;
    }),
  );
}

test("logowanie organizatora (sesja dla testów importu gości)", async ({ page }) => {
  const { organizerEmail } = state();
  await ensureEvents();
  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("przycisk „Import gości” na liście uczestników prowadzi do strony importu", async ({ page }) => {
    const { eventId } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees`);
    await page.getByRole("link", { name: "Import gości" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/attendees/import$`));
    await expect(page.getByRole("heading", { name: "Import gości" })).toBeVisible();
    // Samodzielnie zapisana Sylwia nie jest w kolejce biletów.
    await expect(queueCounter(page)).toHaveText("Bilety do wysłania: 0");
    await expect(page.getByRole("button", { name: "Wyślij bilety" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Dodaj gości \(0\)/ })).toBeDisabled();
  });

  test("wklejona lista z nagłówkiem: podgląd z liczbą poprawnych i błędnymi wierszami", async ({ page }) => {
    const { eventId } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees/import`);
    await page.getByLabel("Lista gości").fill(PASTED_LIST);

    await expect(page.getByText("Poprawne wiersze: 3")).toBeVisible();
    await expect(page.getByText(`${JAN.first} ${JAN.last}, ${JAN.email}, ${JAN.company}`)).toBeVisible();
    await expect(page.getByText(`${OLA.first} ${OLA.last}, ${OLA.email}, ${OLA.company}`)).toBeVisible();
    await expect(page.getByText(`${KASIA.first} ${KASIA.last}, ${KASIA.email}`, { exact: true })).toBeVisible();

    await expect(page.getByText("Do poprawy, te wiersze nie zostaną dodane: 3")).toBeVisible();
    await expect(page.getByText(/^Wiersz 4: Brak poprawnego adresu e-mail/)).toBeVisible();
    await expect(page.getByText(/^Wiersz 5: Brak imienia lub nazwiska/)).toBeVisible();
    await expect(page.getByText(/^Wiersz 6: Ten adres jest już wyżej na liście/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj gości (3)" })).toBeEnabled();

    // Podgląd niczego nie zapisuje.
    expect((await attendeesOf(eventId)).filter((a) => a.imported_at)).toHaveLength(0);
  });

  test("podgląd: lista bez nagłówka i kolumna „Imię i nazwisko” (bez zapisu)", async ({ page }) => {
    const { eventId } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees/import`);
    const input = page.getByLabel("Lista gości");

    // Bez nagłówka, średniki: imię, nazwisko, e-mail, firma, stanowisko.
    await input.fill("Tomasz;Bezgłówkowy;tomasz.bez.14@e2e.test;Firma Eta;Dyrektor\nAnna;Druga;anna.druga.14@e2e.test;;");
    await expect(page.getByText("Poprawne wiersze: 2")).toBeVisible();
    await expect(page.getByText("Tomasz Bezgłówkowy, tomasz.bez.14@e2e.test, Firma Eta")).toBeVisible();
    await expect(page.getByText("Anna Druga, anna.druga.14@e2e.test", { exact: true })).toBeVisible();

    // Nagłówek z jedną kolumną imienia i nazwiska, przecinki, pole w cudzysłowie.
    await input.fill('E-mail,Imię i nazwisko,Firma\nmarek.pelny.14@e2e.test,Marek Pełny Nazwisko,"Firma, Spółka"\nsamo.imie.14@e2e.test,Samoimię,');
    await expect(page.getByText("Poprawne wiersze: 1")).toBeVisible();
    await expect(page.getByText("Marek Pełny Nazwisko, marek.pelny.14@e2e.test, Firma, Spółka")).toBeVisible();
    await expect(page.getByText(/^Wiersz 3: Brak imienia lub nazwiska/)).toBeVisible();

    await input.fill("");
    expect(await attendeesOf(eventId)).toHaveLength(1);
  });

  test("„Dodaj gości”: tylko poprawne wiersze, zatwierdzeni, bez networkingu, bez maila", async ({ page }) => {
    const { eventId, otherEventId } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees/import`);
    await page.getByLabel("Lista gości").fill(PASTED_LIST);
    await page.getByRole("button", { name: "Dodaj gości (3)" }).click();
    await expect(page.getByText(/^Dodano: 3\.$/)).toBeVisible();
    await expect(page.getByLabel("Lista gości")).toHaveValue("");

    const rows = await attendeesOf(eventId);
    const imported = rows.filter((a) => a.imported_at);
    expect(imported.map((a) => a.email).sort()).toEqual(GUESTS.map((g) => g.email).sort());
    for (const g of GUESTS) {
      const a = imported.find((r) => r.email === g.email)!;
      expect(a).toMatchObject({
        first_name: g.first,
        last_name: g.last,
        company: g.company || null,
        status: "approved",
        networking_visible: false,
        ticket_sent_at: null,
        gdpr_consent_at: null,
      });
    }
    // Błędne wiersze nie trafiły do bazy.
    expect(rows.find((a) => a.email?.includes("bez.nazwiska"))).toBeUndefined();
    expect(rows.find((a) => a.last_name === "Duplikat")).toBeUndefined();
    expect(rows).toHaveLength(4);

    // Adres z innego wydarzenia: dodany tutaj, a zapis w tamtym wydarzeniu bez zmian.
    const other = await attendeesOf(otherEventId);
    expect(other.filter((a) => a.email === KASIA.email)).toHaveLength(1);
    expect(other[0].imported_at).toBeNull();

    // Import nie wysyła maili.
    await page.waitForTimeout(2000);
    for (const g of GUESTS) expect(await appMails(g.email), `brak maila do ${g.email}`).toHaveLength(0);

    await page.reload();
    await expect(queueCounter(page)).toHaveText("Bilety do wysłania: 3");
    await expect(page.getByRole("button", { name: "Wyślij bilety" })).toBeEnabled();
  });

  test("ponowny import tej samej listy (z osobą zapisaną samodzielnie) nikogo nie dodaje", async ({ page }) => {
    const { eventId } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees/import`);
    await page
      .getByLabel("Lista gości")
      .fill(`${PASTED_LIST}\n${SYLWIA.first}\t${SYLWIA.last}\t${SYLWIA.email}\tFirma Zeta`);
    await expect(page.getByText("Poprawne wiersze: 4")).toBeVisible();
    await page.getByRole("button", { name: "Dodaj gości (4)" }).click();
    await expect(page.getByText(/^Dodano: 0\. Pominięto już zapisanych: 4\.$/)).toBeVisible();

    const rows = await attendeesOf(eventId);
    expect(rows).toHaveLength(4);
    // Sylwia nadal jako zapisana samodzielnie, nie trafia do kolejki biletów.
    expect(rows.find((a) => a.email === SYLWIA.email)?.imported_at).toBeNull();
    await page.reload();
    await expect(queueCounter(page)).toHaveText("Bilety do wysłania: 3");
  });

  test("„Wyślij bilety”: potwierdzenie, jeden mail z QR na gościa, licznik spada do 0", async ({ page }) => {
    const { eventId, slug } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees/import`);
    await page.getByRole("button", { name: "Wyślij bilety" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Wysłać bilety do 3 osób?")).toBeVisible();
    // Anuluj: nic nie wychodzi.
    await dialog.getByRole("button", { name: "Anuluj" }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(1000);
    for (const g of GUESTS) expect(await appMails(g.email)).toHaveLength(0);

    await page.getByRole("button", { name: "Wyślij bilety" }).click();
    await dialog.getByRole("button", { name: "Wyślij", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(/Wysłano: 3\.\s*Gotowe\./, { timeout: 30_000 });

    for (const g of GUESTS) {
      const mail = await waitForAppMail(g.email, /Potwierdzenie rejestracji/);
      expect(mail.subject).toContain(EVENT_NAME);
      expect(mail.attachments.map((a) => a.filename)).toEqual(["kod-qr-wejscie.png"]);
      const panelLink = linksIn(mail.html).find((l) => l.includes("/a/"));
      expect(panelLink, `link do panelu dla ${g.email}`).toBeTruthy();
      expect(panelLink!.startsWith(`${APP_URL}/e/${slug}/a/`), `link lokalny: ${panelLink}`).toBe(true);
      expect(await appMails(g.email), `dokładnie jeden mail do ${g.email}`).toHaveLength(1);
    }
    // Samodzielnie zapisana nie dostaje maila ze zbiorczej wysyłki.
    expect(await appMails(SYLWIA.email)).toHaveLength(0);

    const rows = await attendeesOf(eventId);
    for (const g of GUESTS) expect(rows.find((a) => a.email === g.email)?.ticket_sent_at).not.toBeNull();
    expect(rows.find((a) => a.email === SYLWIA.email)?.ticket_sent_at).toBeNull();

    await page.reload();
    await expect(queueCounter(page)).toHaveText("Bilety do wysłania: 0");
    await expect(page.getByRole("button", { name: "Wyślij bilety" })).toBeDisabled();
  });

  test("ponowna wysyłka zbiorcza nic nie wysyła", async ({ page }) => {
    const { eventId } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees/import`);
    await expect(queueCounter(page)).toHaveText("Bilety do wysłania: 0");
    const send = page.getByRole("button", { name: "Wyślij bilety" });
    await expect(send).toBeDisabled();
    await send.click({ force: true });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.waitForTimeout(1500);
    for (const g of GUESTS) expect(await ticketMails(g.email)).toHaveLength(1);
  });

  test("przycisk przy osobie na liście: ponowny bilet dla gościa i bilet dla zapisanej samodzielnie", async ({ page }) => {
    const { eventId } = await ensureEvents();
    await page.goto(`/admin/events/${eventId}/attendees`);

    const jan = attendeeCard(page, JAN.email);
    await jan.getByRole("button", { name: "Wyślij bilet ponownie" }).click();
    await expect(jan.getByText("Wysłano", { exact: true })).toBeVisible();
    await expect.poll(async () => (await ticketMails(JAN.email)).length, { message: "drugi mail do Jana" }).toBe(2);
    expect(await ticketMails(OLA.email)).toHaveLength(1);

    const sylwia = attendeeCard(page, SYLWIA.email);
    await sylwia.getByRole("button", { name: "Wyślij bilet", exact: true }).click();
    await expect(sylwia.getByText("Wysłano", { exact: true })).toBeVisible();
    const mail = await waitForAppMail(SYLWIA.email, /Potwierdzenie rejestracji/);
    expect(mail.attachments.map((a) => a.filename)).toContain("kod-qr-wejscie.png");
    expect(await ticketMails(SYLWIA.email)).toHaveLength(1);
    await expect
      .poll(async () => (await attendeesOf(eventId)).find((a) => a.email === SYLWIA.email)?.ticket_sent_at ?? null)
      .not.toBeNull();

    await page.reload();
    await expect(attendeeCard(page, SYLWIA.email).getByRole("button", { name: "Wyślij bilet ponownie" })).toBeVisible();

    // Samodzielnie zapisana nadal poza kolejką importu.
    await page.goto(`/admin/events/${eventId}/attendees/import`);
    await expect(queueCounter(page)).toHaveText("Bilety do wysłania: 0");
  });

  test("zaimportowany gość otwiera panel z linku w mailu i zostaje zameldowany na recepcji", async ({ page, browser }) => {
    const { eventId } = await ensureEvents();
    const mail = await waitForAppMail(OLA.email, /Potwierdzenie rejestracji/);
    const panelLink = linksIn(mail.html).find((l) => l.includes("/a/"))!;

    const phone = await browser.newContext(NO_SESSION);
    const p = await phone.newPage();
    await p.goto(panelLink);
    await expect(p.getByText(/Cześć, Ola/)).toBeVisible();
    await expect(p.getByAltText(/Kod QR/i).first()).toBeVisible();
    await phone.close();

    await page.goto(`/admin/events/${eventId}/reception`);
    const row = page.locator("div.rounded-lg.border", { hasText: `${OLA.first} ${OLA.last}` });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Zamelduj" }).click();
    await expect(row.getByRole("button", { name: "Cofnij zameldowanie" })).toBeVisible();
    await expect
      .poll(async () => (await attendeesOf(eventId)).find((a) => a.email === OLA.email)?.checked_in_at ?? null)
      .not.toBeNull();
  });

  test("plik CSV w Windows-1250: polskie znaki poprawnie w podglądzie i w bazie", async ({ page }) => {
    const { eventId } = await ensureEvents();
    const csv = [
      "Imię;Nazwisko;E-mail;Firma",
      "Łucja;Żółkiewska;lucja.zolkiewska.14@e2e.test;Śląskie Łąki",
      "Grzegorz;Brzęczyszczykiewicz;grzegorz.brzeczyszczykiewicz.14@e2e.test;Zażółć Gęślą Jaźń",
    ].join("\r\n");
    const bytes = toWindows1250(csv);
    // Warunek testu: to NIE jest poprawny UTF-8, aplikacja musi rozpoznać Windows-1250.
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toThrow();

    await page.goto(`/admin/events/${eventId}/attendees/import`);
    await page.getByLabel("Plik CSV").setInputFiles({ name: "goscie.csv", mimeType: "text/csv", buffer: bytes });
    await expect(page.getByLabel("Lista gości")).toHaveValue(csv.replace(/\r\n/g, "\n"));
    await expect(page.getByText("Poprawne wiersze: 2")).toBeVisible();
    await expect(page.getByText("Łucja Żółkiewska, lucja.zolkiewska.14@e2e.test, Śląskie Łąki")).toBeVisible();
    await expect(
      page.getByText("Grzegorz Brzęczyszczykiewicz, grzegorz.brzeczyszczykiewicz.14@e2e.test, Zażółć Gęślą Jaźń"),
    ).toBeVisible();
    await expect(page.getByText(/Do poprawy/)).toHaveCount(0);

    await page.getByRole("button", { name: "Dodaj gości (2)" }).click();
    await expect(page.getByText(/^Dodano: 2\.$/)).toBeVisible();
    const rows = await attendeesOf(eventId);
    expect(rows.find((a) => a.email === "lucja.zolkiewska.14@e2e.test")).toMatchObject({
      first_name: "Łucja",
      last_name: "Żółkiewska",
      company: "Śląskie Łąki",
      status: "approved",
    });
    expect(rows.find((a) => a.email === "grzegorz.brzeczyszczykiewicz.14@e2e.test")).toMatchObject({
      first_name: "Grzegorz",
      last_name: "Brzęczyszczykiewicz",
      company: "Zażółć Gęślą Jaźń",
    });
    // Nowi goście czekają na bilet; wcześniej wysłani nie wracają do kolejki.
    await page.reload();
    await expect(queueCounter(page)).toHaveText("Bilety do wysłania: 2");
  });
});
