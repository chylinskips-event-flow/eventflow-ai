import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { admin, appMails, loginWithMagicLink, state, waitForAppMail } from "../helpers";

// Organizator konfiguruje wydarzenie przez UI: nowe wydarzenie, ustawienia, prelegent, sesja,
// darmowy bilet, publikacja i cofnięcie publikacji, własny temat maila potwierdzenia.
// Do tego autoryzacja: drugi organizator nie otwiera cudzego wydarzenia (404).

// Sesja organizatora tylko dla tego pliku (poza repozytorium — nie trafi do gita).
const AUTH_FILE = path.join(os.tmpdir(), "eventro-e2e-organizer-08.json");
// Uczestnicy i drugi organizator — czysta przeglądarka, bez sesji organizatora.
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const STAMP = Date.now().toString(36);
const EVENT = {
  name: "E2E08 Konferencja Konfiguracji",
  editedName: "E2E08 Konferencja Konfiguracji (edytowana)",
  slug: `e2e08-konfiguracja-${STAMP}`,
  location: "Kraków, Centrum E2E",
  editedLocation: "Gdańsk, Hala Zmieniona 08",
};
const SPEAKER = { first: "Halina", last: "Prelegentka08", company: "Firma Osiem" };
const SESSION_TITLE = "Warsztat konfiguracji 08";
const TICKET_NAME = "Wejściówka 08";

// Wypełniane przez kolejne testy w trybie serial.
let eventId = "";

function warsawParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  return Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
}

/** „RRRR-MM-15 GG:MM” w następnym miesiącu (czas warszawski), jak wybrany w kalendarzu. */
function nextMonthLocal(day: number, hour: string) {
  const now = warsawParts(new Date());
  let year = Number(now.year);
  let month = Number(now.month) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${hour}:00`;
}

function asWarsawLocal(iso: string) {
  const p = warsawParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Kalendarz DateTimePicker: następny miesiąc → dzień → godzina (minuty domyślnie 00). */
async function pickNextMonthDateTime(page: Page, fieldId: string, day: number, hour: string) {
  await page.locator(`#${fieldId}`).click();
  const popover = page.getByRole("dialog");
  await expect(popover).toBeVisible();
  // Nagłówek kalendarza: [poprzedni miesiąc] nazwa miesiąca [następny miesiąc].
  await popover.getByRole("button").nth(1).click();
  await popover.getByRole("button", { name: String(day), exact: true }).click();
  await popover.getByRole("combobox", { name: "Godzina" }).click();
  await page.getByRole("option", { name: hour, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(page.locator(`#${fieldId}`)).toContainText(`${hour}:00`);
}

async function organizationIdOf(email: string): Promise<string> {
  const db = admin();
  const { data: users, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  const user = users.users.find((u) => u.email === email);
  if (!user) throw new Error(`brak użytkownika ${email}`);
  const { data: org } = await db.from("organizations").select("id").eq("owner_user_id", user.id).single();
  if (!org) throw new Error(`brak organizacji ${email}`);
  return org.id;
}

test.describe("organizator: konfiguracja wydarzenia przez UI", () => {
  test.describe.configure({ mode: "serial" });

  test("logowanie organizatora magic linkiem", async ({ page }) => {
    await loginWithMagicLink(page, "/login", state().organizerEmail);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole("link", { name: "Nowe wydarzenie" })).toBeVisible();
    await page.context().storageState({ path: AUTH_FILE });
  });

  test.describe("zalogowany organizator", () => {
    test.use({ storageState: AUTH_FILE });

    test("nowe wydarzenie z formularza powstaje jako szkic z podanymi danymi", async ({ page }) => {
      await page.goto("/admin");
      await page.getByRole("link", { name: "Nowe wydarzenie" }).click();
      await expect(page).toHaveURL(/\/admin\/events\/new/);

      await page.locator("#name").fill(EVENT.name);
      // Adres podpowiada się z nazwy; ustawiamy własny, unikalny.
      await expect(page.locator("#slug")).toHaveValue(/^e2e08-konferencja-konfiguracji/);
      await page.locator("#slug").fill(EVENT.slug);
      await expect(page.getByText("Adres jest wolny.")).toBeVisible();

      await pickNextMonthDateTime(page, "starts_at", 15, "10");
      await pickNextMonthDateTime(page, "ends_at", 15, "18");
      await expect(page.locator("#timezone")).toContainText("Europe/Warsaw");
      await page.locator("#location").fill(EVENT.location);
      await page.locator("#room_names").fill("Sala Główna\nSala Boczna");

      await page.getByRole("button", { name: "Utwórz event" }).click();
      await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}/);
      eventId = /\/admin\/events\/([0-9a-f-]{36})/.exec(page.url())![1];

      await expect(page.locator("header[data-workspace-header]")).toContainText(EVENT.name);
      await expect(page.locator("header[data-workspace-header]")).toContainText("Szkic");

      const { data } = await admin()
        .from("events")
        .select("name, slug, status, timezone, location, room_names, requires_approval, starts_at, ends_at")
        .eq("id", eventId)
        .single();
      expect(data).toMatchObject({
        name: EVENT.name,
        slug: EVENT.slug,
        status: "draft",
        timezone: "Europe/Warsaw",
        location: EVENT.location,
        room_names: ["Sala Główna", "Sala Boczna"],
        requires_approval: false,
      });
      expect(asWarsawLocal(data!.starts_at)).toBe(nextMonthLocal(15, "10"));
      expect(asWarsawLocal(data!.ends_at)).toBe(nextMonthLocal(15, "18"));
    });

    test("edycja ustawień: zapis zmian i ich trwałość po odświeżeniu", async ({ page }) => {
      await page.goto(`/admin/events/${eventId}`);
      await expect(page.locator("#name")).toHaveValue(EVENT.name);
      await page.locator("#name").fill(EVENT.editedName);
      await page.locator("#location").fill(EVENT.editedLocation);
      await page.locator("#room_names").fill("Sala Główna\nSala Boczna\nSala Warsztatowa");
      await page.getByRole("button", { name: "Zapisz zmiany" }).click();
      await expect(page.getByText("Zapisano zmiany.")).toBeVisible();

      const { data } = await admin().from("events").select("name, slug, location, room_names, status").eq("id", eventId).single();
      expect(data).toMatchObject({
        name: EVENT.editedName,
        slug: EVENT.slug,
        location: EVENT.editedLocation,
        room_names: ["Sala Główna", "Sala Boczna", "Sala Warsztatowa"],
        status: "draft",
      });

      await page.reload();
      await expect(page.locator("#name")).toHaveValue(EVENT.editedName);
      await expect(page.locator("#location")).toHaveValue(EVENT.editedLocation);
      await expect(page.locator("header[data-workspace-header]")).toContainText(EVENT.editedName);
    });

    test("prelegent i sesja dodane przez okna dialogowe", async ({ page }) => {
      // Prelegent
      await page.goto(`/admin/events/${eventId}/speakers`);
      await expect(page.getByText("Nie masz jeszcze żadnych prelegentów.")).toBeVisible();
      await page.getByRole("button", { name: "Dodaj prelegenta" }).click();
      const speakerDialog = page.getByRole("dialog");
      await expect(speakerDialog.getByRole("heading", { name: "Dodaj prelegenta" })).toBeVisible();
      await speakerDialog.locator("#first_name").fill(SPEAKER.first);
      await speakerDialog.locator("#last_name").fill(SPEAKER.last);
      await speakerDialog.locator("#company").fill(SPEAKER.company);
      await speakerDialog.getByRole("button", { name: "Dodaj prelegenta" }).click();
      await expect(speakerDialog).toBeHidden();
      await expect(page.getByText(`${SPEAKER.first} ${SPEAKER.last}`)).toBeVisible();

      const { data: speaker } = await admin()
        .from("speakers")
        .select("id, first_name, last_name, company")
        .eq("event_id", eventId)
        .single();
      expect(speaker).toMatchObject({ first_name: SPEAKER.first, last_name: SPEAKER.last, company: SPEAKER.company });

      // Sesja: start domyślnie = początek wydarzenia, sala z listy, 60 min, z prelegentem.
      await page.goto(`/admin/events/${eventId}/sessions`);
      await page.getByRole("button", { name: "Dodaj sesję" }).click();
      const sessionDialog = page.getByRole("dialog");
      await expect(sessionDialog.getByRole("heading", { name: "Dodaj sesję" })).toBeVisible();
      await sessionDialog.locator("#title").fill(SESSION_TITLE);
      await sessionDialog.locator("#room").click();
      await page.getByRole("option", { name: "Sala Główna", exact: true }).click();
      await sessionDialog.locator("#duration_select").click();
      await page.getByRole("option", { name: "60 min", exact: true }).click();
      await sessionDialog.getByRole("button", { name: `${SPEAKER.first} ${SPEAKER.last}` }).click();
      await expect(sessionDialog.getByText(/Koniec: 11:00/)).toBeVisible();
      await sessionDialog.getByRole("button", { name: "Dodaj sesję" }).click();
      await expect(sessionDialog).toBeHidden();
      await expect(page.getByText(SESSION_TITLE)).toBeVisible();

      const db = admin();
      const { data: ev } = await db.from("events").select("starts_at").eq("id", eventId).single();
      const { data: session } = await db
        .from("sessions")
        .select("id, title, room, starts_at, ends_at")
        .eq("event_id", eventId)
        .single();
      expect(session).toMatchObject({ title: SESSION_TITLE, room: "Sala Główna" });
      expect(new Date(session!.starts_at).getTime()).toBe(new Date(ev!.starts_at).getTime());
      expect(new Date(session!.ends_at).getTime() - new Date(session!.starts_at).getTime()).toBe(60 * 60_000);
      const { data: links } = await db.from("session_speakers").select("speaker_id").eq("session_id", session!.id);
      expect(links?.map((l) => l.speaker_id)).toEqual([speaker!.id]);
    });

    test("darmowy typ biletu dodany w panelu biletów", async ({ page }) => {
      await page.goto(`/admin/events/${eventId}/tickets`);
      await expect(page.getByText("Brak typów biletów.", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Dodaj typ biletu" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Nowy typ biletu" })).toBeVisible();
      await dialog.locator("#ct-name").fill(TICKET_NAME);
      await dialog.locator("#ct-desc").fill("Bezpłatne wejście na cały dzień");
      await dialog.locator("#ct-price").fill("0");
      await dialog.locator("#ct-qty").fill("100");
      await dialog.getByRole("button", { name: "Dodaj typ biletu" }).click();
      await expect(dialog.getByText("Typ biletu dodany.")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.locator("table").getByText(TICKET_NAME)).toBeVisible();

      const { data } = await admin()
        .from("ticket_types")
        .select("name, price, quantity_total, enabled")
        .eq("event_id", eventId);
      expect(data).toEqual([{ name: TICKET_NAME, price: 0, quantity_total: 100, enabled: true }]);
    });

    test("publikacja: status opublikowany i strona publiczna z agendą, prelegentem i biletem", async ({ page, browser }) => {
      await page.goto(`/admin/events/${eventId}`);
      await page.getByRole("button", { name: "Opublikuj event" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm.getByRole("heading", { name: "Opublikować event?" })).toBeVisible();
      await confirm.getByRole("button", { name: "Opublikuj", exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(page.getByText("Wydarzenie opublikowane")).toBeVisible();
      await expect(page.locator("header[data-workspace-header]")).toContainText("Opublikowany");

      const { data } = await admin().from("events").select("status").eq("id", eventId).single();
      expect(data?.status).toBe("published");

      const visitor = await browser.newContext(NO_SESSION);
      const v = await visitor.newPage();
      const res = await v.goto(`/e/${EVENT.slug}`);
      expect(res?.status()).toBe(200);
      await expect(v.getByRole("heading", { level: 1, name: EVENT.editedName })).toBeVisible();
      await expect(v.getByText(SESSION_TITLE).first()).toBeVisible();
      await expect(v.getByText(`${SPEAKER.first} ${SPEAKER.last}`).first()).toBeVisible();
      await expect(v.getByText(TICKET_NAME).first()).toBeVisible();
      await visitor.close();
    });

    test("cofnięcie publikacji: znowu szkic, strona publiczna bez nazwy wydarzenia", async ({ page, browser }) => {
      await page.goto(`/admin/events/${eventId}?tab=strefa-niebezpieczna`);
      await page.getByRole("button", { name: "Cofnij publikację" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm.getByRole("heading", { name: "Cofnąć publikację?" })).toBeVisible();
      await confirm.getByRole("button", { name: "Cofnij publikację" }).click();
      await expect(confirm).toBeHidden();
      await expect(page.getByText("Publikacja cofnięta — wydarzenie jest teraz szkicem.")).toBeVisible();
      await expect(page.locator("header[data-workspace-header]")).toContainText("Szkic");

      const { data } = await admin().from("events").select("status").eq("id", eventId).single();
      expect(data?.status).toBe("draft");

      const visitor = await browser.newContext(NO_SESSION);
      const v = await visitor.newPage();
      const res = await v.goto(`/e/${EVENT.slug}`);
      expect(res?.status()).toBeLessThan(500);
      await expect(v.locator("body")).toBeVisible();
      await expect(v.getByText(EVENT.editedName)).toHaveCount(0);
      await expect(v.getByText(SESSION_TITLE)).toHaveCount(0);
      await expect(v.locator("input[name=email]")).toHaveCount(0);
      await visitor.close();
    });

    test("własny temat szablonu „Potwierdzenie rejestracji” trafia do maila nowej rejestracji", async ({ page, browser }) => {
      const { organizerEmail } = state();
      const db = admin();
      const orgId = await organizationIdOf(organizerEmail);
      const tplName = "E2E08 Szablony";
      const tplSlug = `e2e08-szablony-${STAMP}`;
      const starts = new Date(Date.now() + 10 * 86_400_000);
      starts.setUTCHours(8, 0, 0, 0);
      const { data: tplEvent, error } = await db
        .from("events")
        .insert({
          organization_id: orgId,
          name: tplName,
          slug: tplSlug,
          status: "published",
          requires_approval: false,
          timezone: "Europe/Warsaw",
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + 8 * 3_600_000).toISOString(),
          location: "Poznań, Sala Szablonów",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      // Strona szablonów musi się wyrenderować na serwerze (200). Miękka asercja — reszta
      // przepływu (zapis i mail z nowym tematem) jest sprawdzana mimo błędu.
      const messagesRes = await page.goto(`/admin/events/${tplEvent!.id}/messages`);
      expect.soft(messagesRes?.status(), "GET /messages").toBe(200);
      await expect(page.getByRole("heading", { name: "Szablony komunikatów" })).toBeVisible();
      const card = page
        .locator('[data-slot="card"]')
        .filter({ has: page.getByText("Potwierdzenie rejestracji", { exact: true }) });
      await expect(card).toHaveCount(1);
      await expect(card.getByText("Domyślny")).toBeVisible();
      await card.getByRole("button", { name: "Edytuj" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Edytuj szablon – Potwierdzenie rejestracji" })).toBeVisible();
      await expect(dialog.locator("#subject")).toHaveValue("Potwierdzenie rejestracji – {nazwa_eventu}");
      await dialog.locator("#subject").fill("E2E08: masz miejsce na {nazwa_eventu}");
      await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(card.getByText("Własny")).toBeVisible();
      await expect(card.getByText("Temat: E2E08: masz miejsce na {nazwa_eventu}")).toBeVisible();

      const { data: tpl } = await db
        .from("event_message_templates")
        .select("subject")
        .eq("event_id", tplEvent!.id)
        .eq("template_type", "registration_confirmed")
        .single();
      expect(tpl?.subject).toBe("E2E08: masz miejsce na {nazwa_eventu}");

      // Nowa rejestracja (czysta przeglądarka) dostaje mail z edytowanym tematem.
      const email = `rejestracja.${STAMP}.08@e2e.test`;
      const visitor = await browser.newContext(NO_SESSION);
      const v = await visitor.newPage();
      await v.goto(`/e/${tplSlug}/register`);
      await v.locator("#first_name").fill("Renata");
      await v.locator("#last_name").fill("Szablonowa");
      await v.locator("#email").fill(email);
      await v.locator("#gdpr_consent").click();
      await v.getByRole("button", { name: "Zarejestruj się" }).click();
      await expect(v).toHaveURL(/\/welcome/);
      await visitor.close();

      const mail = await waitForAppMail(email, /E2E08/);
      expect(mail.subject).toBe(`E2E08: masz miejsce na ${tplName}`);
      expect(mail.attachments.map((a) => a.filename)).toContain("kod-qr-wejscie.png");
      const all = await appMails(email);
      expect(all.filter((m) => /Potwierdzenie rejestracji/.test(m.subject))).toHaveLength(0);
    });
  });
});

test.describe("autoryzacja między organizatorami", () => {
  test("drugi organizator dostaje 404 na cudze wydarzenie, uczestników i recepcję", async ({ browser }) => {
    const { events } = state();
    const db = admin();
    const emailB = `drugi.organizator.${STAMP}.08@e2e.test`;
    const { data: created, error: userError } = await db.auth.admin.createUser({ email: emailB, email_confirm: true });
    if (userError) throw new Error(userError.message);
    const { error: orgError } = await db.from("organizations").insert({
      name: "E2E08 Druga Organizacja",
      slug: `e2e08-druga-${STAMP}`,
      owner_user_id: created.user!.id,
      billing_email: emailB,
    });
    if (orgError) throw new Error(orgError.message);

    const ctx = await browser.newContext(NO_SESSION);
    const page = await ctx.newPage();
    await loginWithMagicLink(page, "/login", emailB);
    await expect(page).toHaveURL(/\/admin\/?$/);
    // Na własnej liście nie widzi wydarzeń pierwszego organizatora.
    await expect(page.getByText(events.open.name)).toHaveCount(0);
    await expect(page.getByText(events.draft.name)).toHaveCount(0);

    // Opublikowane (publiczne przez RLS) i szkic — oba muszą być niedostępne w panelu.
    for (const target of [events.open, events.draft]) {
      for (const sub of ["", "/attendees", "/reception"]) {
        const url = `/admin/events/${target.id}${sub}`;
        const res = await page.goto(url);
        expect(res?.status(), url).toBe(404);
        await expect(page.getByText(/could not be found|nie znaleziono|nie zostało znalezione/i).first(), url).toBeVisible();
        await expect(page.getByText(target.name), url).toHaveCount(0);
      }
    }
    await ctx.close();
  });
});
