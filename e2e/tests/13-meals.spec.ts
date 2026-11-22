import { expect, test, type Page } from "@playwright/test";
import { admin, anon, loginWithMagicLink, state } from "../helpers";

// Posiłki: wydawanie lunchu po bilecie (lista w panelu organizatora i link obsługi lokalu),
// jeden bilet = jedno wydanie na posiłek, cofnięcie, filtry, rozliczenie CSV z lokalem,
// usuwanie posiłku (tylko bez wydań), usunięty uczestnik w rozliczeniu jako „Dane usunięte”.
// Do tego link recepcji budowany na adresie apex /e/{slug}/recepcja/{token}.
//
// Plik jest niezależny od innych: loguje się sam i tworzy własne wydarzenie w organizacji E2E.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-13.json";
// Obsługa lokalu i osoba z zewnątrz: czysta przeglądarka, bez sesji organizatora.
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const SUFFIX = Date.now().toString(36);
const EVENT_NAME = "E2E13 Posiłki";
const LUNCH = "E2E13 Lunch, dzień 1";
const DINNER = "E2E13 Kolacja";
const EMPTY_MEAL = "E2E13 Przekąska do usunięcia";
const RACE_MEAL = "E2E13 Śniadanie";

type Fixture = { eventId: string; slug: string };
let fixture: Fixture | null = null;

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Własne opublikowane wydarzenie z uczestnikami (tworzone raz na plik). */
async function ensureEvent(): Promise<Fixture> {
  if (fixture) return fixture;
  const db = admin();
  const { data: org, error: orgErr } = await db.from("organizations").select("id").eq("slug", "e2e-org").single();
  if (orgErr || !org) throw new Error(`[13] organizacja E2E: ${orgErr?.message ?? "brak"}`);
  const slug = `e2e-13-posilki-${SUFFIX}`;
  const { data: ev, error } = await db
    .from("events")
    .insert({
      organization_id: org.id,
      slug,
      name: EVENT_NAME,
      status: "published",
      requires_approval: false,
      timezone: "Europe/Warsaw",
      starts_at: at(12, 8),
      ends_at: at(12, 16),
      location: "Łódź, Hala Expo",
    })
    .select("id, slug")
    .single();
  if (error || !ev) throw new Error(`[13] wydarzenie: ${error?.message ?? "brak"}`);
  fixture = { eventId: ev.id, slug: ev.slug };

  await addAttendee(ev.id, "Agata", "Obiadowa", "approved", "Firma Lunch");
  await addAttendee(ev.id, "Bogdan", "Obiadowy", "approved", "Firma Kolacja");
  await addAttendee(ev.id, "Celina", "Obiadowa", "approved");
  await addAttendee(ev.id, "Paweł", "Czekający", "pending");
  await addAttendee(ev.id, "Rafał", "Odrzucony", "rejected");
  return fixture;
}

/** Adres e-mail tylko z ASCII (np. „Paweł Czekający” → pawel.czekajacy.13@e2e.test). */
function emailFor(first: string, last: string) {
  const ascii = (v: string) =>
    v.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${ascii(first)}.${ascii(last)}.13@e2e.test`;
}

async function addAttendee(
  eventId: string,
  first: string,
  last: string,
  status: "approved" | "pending" | "rejected",
  company?: string,
) {
  const { data, error } = await admin()
    .from("attendees")
    .insert({ event_id: eventId, first_name: first, last_name: last, company: company ?? null, email: emailFor(first, last), status })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function attendeeId(first: string, last: string): Promise<string> {
  const { data } = await admin().from("attendees").select("id").eq("email", emailFor(first, last)).single();
  return data!.id as string;
}

async function mealByName(name: string) {
  const { eventId } = await ensureEvent();
  const { data } = await admin()
    .from("event_meals")
    .select("id, name, access_token")
    .eq("event_id", eventId)
    .eq("name", name)
    .maybeSingle();
  return data as { id: string; name: string; access_token: string | null } | null;
}

async function redemptions(mealId: string) {
  const { data } = await admin().from("meal_redemptions").select("attendee_id, redeemed_by, redeemed_at").eq("meal_id", mealId);
  return (data ?? []) as { attendee_id: string | null; redeemed_by: string; redeemed_at: string }[];
}

/** Karta posiłku na liście „Posiłki”. */
function mealCard(page: Page, name: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByText(name, { exact: true }) });
}

/** Licznik panelu wydawania „N / M wydano”. */
function mealCounter(page: Page) {
  return page.locator("div.flex.items-baseline", { hasText: "wydano" }).first();
}

function mealRow(page: Page, name: string) {
  return page.locator("div.rounded-lg.border", { hasText: name });
}

async function addMealViaUi(page: Page, name: string) {
  await page.getByLabel("Nazwa posiłku").fill(name);
  await page.getByRole("button", { name: "Dodaj posiłek" }).click();
  await expect(mealCard(page, name)).toBeVisible();
  await expect(page.getByLabel("Nazwa posiłku")).toHaveValue("");
}

/** Plik CSV pobrany przyciskiem „Rozliczenie CSV” z karty posiłku (bez BOM, wiersze). */
async function downloadCsv(page: Page, mealName: string): Promise<{ filename: string; lines: string[]; raw: string }> {
  const downloadPromise = page.waitForEvent("download");
  await mealCard(page, mealName).getByRole("link", { name: "Rozliczenie CSV" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return { filename: download.suggestedFilename(), raw, lines: raw.replace(/^﻿/, "").split("\r\n") };
}

test("logowanie organizatora (sesja dla testów posiłków)", async ({ page }) => {
  const { organizerEmail } = state();
  await ensureEvent();
  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("menu wydarzenia: „Posiłki” w sekcji Dzień eventu prowadzi do pustej listy", async ({ page }) => {
    const { eventId } = await ensureEvent();
    await page.goto(`/admin/events/${eventId}/reception`);
    const link = page.getByRole("link", { name: "Posiłki", exact: true }).first();
    await expect(link).toHaveAttribute("href", `/admin/events/${eventId}/meals`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/meals$`));
    await expect(page.getByRole("heading", { name: "Posiłki", exact: true })).toBeVisible();
    await expect(page.getByText("Nie ma jeszcze żadnego posiłku.")).toBeVisible();
  });

  test("dodawanie posiłku: pusta nazwa i nazwa > 80 znaków odrzucone, poprawna dodana z licznikiem 0", async ({ page }) => {
    const { eventId } = await ensureEvent();
    await page.goto(`/admin/events/${eventId}/meals`);
    const input = page.getByLabel("Nazwa posiłku");
    const add = page.getByRole("button", { name: "Dodaj posiłek" });

    // Pusta i z samych spacji: przycisk nieaktywny, Enter nic nie wysyła.
    await expect(add).toBeDisabled();
    await input.fill("    ");
    await expect(add).toBeDisabled();
    await input.press("Enter");

    // Pole ucina do 80 znaków…
    await expect(input).toHaveAttribute("maxlength", "80");
    await input.fill("x".repeat(90));
    await expect(input).toHaveValue("x".repeat(80));
    // …a po obejściu limitu w przeglądarce serwer odmawia.
    await input.evaluate((el) => el.removeAttribute("maxlength"));
    const tooLong = "D".repeat(81);
    await input.fill(tooLong);
    await add.click();
    await expect(page.getByText("Nazwa może mieć najwyżej 80 znaków.")).toBeVisible();
    await expect(input).toHaveValue(tooLong);

    const { data: none } = await admin().from("event_meals").select("id").eq("event_id", eventId);
    expect(none).toHaveLength(0);

    // Poprawna nazwa (spacje dookoła przycięte).
    await input.fill(`  ${LUNCH}  `);
    await add.click();
    await expect(mealCard(page, LUNCH)).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(mealCard(page, LUNCH).getByText("Wydano: 0")).toBeVisible();
    // Posiłek od razu ma link obsługi i można go usunąć (brak wydań).
    await expect(mealCard(page, LUNCH).getByRole("button", { name: "Kopiuj link obsługi" })).toBeVisible();
    await expect(mealCard(page, LUNCH).getByRole("button", { name: "Usuń" })).toBeVisible();

    const lunch = await mealByName(LUNCH);
    expect(lunch).not.toBeNull();
    expect(lunch!.access_token).toBeTruthy();

    await addMealViaUi(page, DINNER);
  });

  test("wydawanie z listy: Wydaj → godzina i licznik, drugi raz się nie da (Cofnij), jeden wiersz w bazie", async ({ page }) => {
    const { eventId } = await ensureEvent();
    const lunch = (await mealByName(LUNCH))!;
    await page.goto(`/admin/events/${eventId}/meals`);
    await mealCard(page, LUNCH).getByRole("link", { name: "Wydawaj" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/meals/${lunch.id}$`));
    await expect(page.getByRole("heading", { name: LUNCH })).toBeVisible();

    // Tylko zatwierdzeni; oczekujący i odrzucony poza listą (także po wyszukaniu).
    await expect(mealCounter(page)).toHaveText(/^\s*0\s*\/\s*3 wydano\s*$/);
    await expect(mealRow(page, "Agata Obiadowa")).toBeVisible();
    await expect(mealRow(page, "Agata Obiadowa").getByText("Firma Lunch")).toBeVisible();
    await expect(mealRow(page, "Bogdan Obiadowy")).toBeVisible();
    await expect(mealRow(page, "Celina Obiadowa")).toBeVisible();
    await expect(page.getByText("Paweł Czekający")).toHaveCount(0);
    await expect(page.getByText("Rafał Odrzucony")).toHaveCount(0);
    const search = page.getByPlaceholder("Szukaj po nazwisku…");
    await search.fill("Czekający");
    await expect(page.getByText("Brak wyników")).toBeVisible();
    await search.fill("firma kolacja");
    await expect(mealRow(page, "Bogdan Obiadowy")).toBeVisible();
    await expect(mealRow(page, "Agata Obiadowa")).toHaveCount(0);
    await search.fill("");

    const agata = mealRow(page, "Agata Obiadowa");
    await agata.getByRole("button", { name: "Wydaj" }).click();
    await expect(mealCounter(page)).toHaveText(/^\s*1\s*\/\s*3 wydano\s*$/);
    await expect(agata.getByText(/^\d{2}:\d{2}$/)).toBeVisible();
    // Zamiast „Wydaj” jest już tylko „Cofnij”.
    await expect(agata.getByRole("button", { name: "Wydaj" })).toHaveCount(0);
    await expect(agata.getByRole("button", { name: "Cofnij wydanie: Agata Obiadowa" })).toBeVisible();

    // Po odświeżeniu stan się trzyma.
    await page.reload();
    await expect(mealCounter(page)).toHaveText(/^\s*1\s*\/\s*3 wydano\s*$/);
    await expect(mealRow(page, "Agata Obiadowa").getByRole("button", { name: "Wydaj" })).toHaveCount(0);

    const agataId = await attendeeId("Agata", "Obiadowa");
    const rows = await redemptions(lunch.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attendee_id: agataId, redeemed_by: "organizer" });

    // Drugie wydanie z karty innego okna (nieaktualny widok): baza nadal ma jeden wiersz.
    const { error: dup } = await admin().from("meal_redemptions").insert({ meal_id: lunch.id, attendee_id: agataId, redeemed_by: "staff" });
    expect(dup?.code).toBe("23505");
    expect(await redemptions(lunch.id)).toHaveLength(1);

    // Licznik na karcie posiłku.
    await page.goto(`/admin/events/${eventId}/meals`);
    await expect(mealCard(page, LUNCH).getByText("Wydano: 1")).toBeVisible();
    await expect(mealCard(page, DINNER).getByText("Wydano: 0")).toBeVisible();
  });

  test("drugi posiłek jest niezależny od pierwszego", async ({ page }) => {
    const { eventId } = await ensureEvent();
    const dinner = (await mealByName(DINNER))!;
    const lunch = (await mealByName(LUNCH))!;
    await page.goto(`/admin/events/${eventId}/meals/${dinner.id}`);
    await expect(page.getByRole("heading", { name: DINNER })).toBeVisible();
    // Agata odebrała lunch, ale kolację może jeszcze dostać.
    await expect(mealCounter(page)).toHaveText(/^\s*0\s*\/\s*3 wydano\s*$/);
    const agata = mealRow(page, "Agata Obiadowa");
    await expect(agata.getByRole("button", { name: "Wydaj" })).toBeVisible();
    await agata.getByRole("button", { name: "Wydaj" }).click();
    await expect(mealCounter(page)).toHaveText(/^\s*1\s*\/\s*3 wydano\s*$/);
    await mealRow(page, "Bogdan Obiadowy").getByRole("button", { name: "Wydaj" }).click();
    await expect(mealCounter(page)).toHaveText(/^\s*2\s*\/\s*3 wydano\s*$/);

    expect(await redemptions(dinner.id)).toHaveLength(2);
    expect(await redemptions(lunch.id)).toHaveLength(1);

    await page.goto(`/admin/events/${eventId}/meals`);
    await expect(mealCard(page, LUNCH).getByText("Wydano: 1")).toBeVisible();
    await expect(mealCard(page, DINNER).getByText("Wydano: 2")).toBeVisible();
  });

  test("filtry Wydane / Jeszcze nie i cofnięcie wydania", async ({ page }) => {
    const { eventId } = await ensureEvent();
    const dinner = (await mealByName(DINNER))!;
    await page.goto(`/admin/events/${eventId}/meals/${dinner.id}`);
    await expect(mealCounter(page)).toHaveText(/^\s*2\s*\/\s*3 wydano\s*$/);

    await page.getByRole("button", { name: "Wydane", exact: true }).click();
    await expect(mealRow(page, "Agata Obiadowa")).toBeVisible();
    await expect(mealRow(page, "Bogdan Obiadowy")).toBeVisible();
    await expect(mealRow(page, "Celina Obiadowa")).toHaveCount(0);

    await page.getByRole("button", { name: "Jeszcze nie", exact: true }).click();
    await expect(mealRow(page, "Celina Obiadowa")).toBeVisible();
    await expect(mealRow(page, "Agata Obiadowa")).toHaveCount(0);
    await expect(mealRow(page, "Bogdan Obiadowy")).toHaveCount(0);

    // Cofnięcie przy filtrze „Wydane”: osoba znika z filtra, licznik spada, wiersz z bazy znika.
    await page.getByRole("button", { name: "Wydane", exact: true }).click();
    await page.getByRole("button", { name: "Cofnij wydanie: Bogdan Obiadowy" }).click();
    await expect(mealCounter(page)).toHaveText(/^\s*1\s*\/\s*3 wydano\s*$/);
    await expect(mealRow(page, "Bogdan Obiadowy")).toHaveCount(0);

    await page.getByRole("button", { name: "Jeszcze nie", exact: true }).click();
    await expect(mealRow(page, "Bogdan Obiadowy").getByRole("button", { name: "Wydaj" })).toBeVisible();
    await page.getByRole("button", { name: "Wszyscy", exact: true }).click();
    await expect(page.locator("div.rounded-lg.border", { hasText: /Obiadow/ })).toHaveCount(3);

    const bogdanId = await attendeeId("Bogdan", "Obiadowy");
    const rows = await redemptions(dinner.id);
    expect(rows).toHaveLength(1);
    expect(rows.some((r) => r.attendee_id === bogdanId)).toBe(false);
  });

  test("link obsługi: działa bez logowania, „Nowy link” i „Wyłącz link” unieważniają stary", async ({ page, browser }) => {
    const { eventId, slug } = await ensureEvent();
    const lunch = (await mealByName(LUNCH))!;
    const first = lunch.access_token!;
    const firstPath = `/e/${slug}/posilek/${first}`;

    // Adres z karty: schowek przeglądarki (apex /e/{slug}/posilek/{token}).
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/admin/events/${eventId}/meals`);
    await mealCard(page, LUNCH).getByRole("button", { name: "Kopiuj link obsługi" }).click();
    await expect(mealCard(page, LUNCH).getByRole("button", { name: "Skopiowano" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`http://localhost:3100${firstPath}`);

    // Obsługa lokalu: czysta przeglądarka, bez sesji organizatora.
    const staffCtx = await browser.newContext(NO_SESSION);
    const s = await staffCtx.newPage();
    await s.goto(firstPath);
    await expect(s.getByRole("heading", { name: LUNCH })).toBeVisible();
    await expect(s.getByText(EVENT_NAME)).toBeVisible();
    await expect(mealCounter(s)).toHaveText(/^\s*1\s*\/\s*3 wydano\s*$/);
    await expect(s.getByText("Paweł Czekający")).toHaveCount(0);
    await expect(mealRow(s, "Agata Obiadowa").getByRole("button", { name: "Wydaj" })).toHaveCount(0);

    // Obsługa wydaje Celinie; w bazie zapis jako „staff”.
    await mealRow(s, "Celina Obiadowa").getByRole("button", { name: "Wydaj" }).click();
    await expect(mealCounter(s)).toHaveText(/^\s*2\s*\/\s*3 wydano\s*$/);
    const celinaId = await attendeeId("Celina", "Obiadowa");
    const rows = await redemptions(lunch.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.attendee_id === celinaId)?.redeemed_by).toBe("staff");

    // Organizator widzi to samo.
    await page.reload();
    await expect(mealCard(page, LUNCH).getByText("Wydano: 2")).toBeVisible();

    // Nowy link unieważnia stary.
    await mealCard(page, LUNCH).getByRole("button", { name: "Nowy link" }).click();
    await expect.poll(async () => (await mealByName(LUNCH))!.access_token, { message: "nowy token posiłku" }).not.toBe(first);
    const second = (await mealByName(LUNCH))!.access_token;
    expect(second).toBeTruthy();
    await s.reload();
    await expect(s.getByText("Link nieaktywny")).toBeVisible();
    await expect(s.getByRole("button", { name: "Wydaj" })).toHaveCount(0);
    const secondPath = `/e/${slug}/posilek/${second}`;
    await s.goto(secondPath);
    await expect(s.getByRole("heading", { name: LUNCH })).toBeVisible();

    // Wyłączenie linku.
    await mealCard(page, LUNCH).getByRole("button", { name: "Wyłącz link" }).click();
    await expect(mealCard(page, LUNCH).getByRole("button", { name: "Utwórz link obsługi" })).toBeVisible();
    await expect(mealCard(page, LUNCH).getByRole("button", { name: "Kopiuj link obsługi" })).toHaveCount(0);
    expect((await mealByName(LUNCH))!.access_token).toBeNull();
    await s.reload();
    await expect(s.getByText("Link nieaktywny")).toBeVisible();
    // Zmyślony token też nie działa.
    await s.goto(`/e/${slug}/posilek/${crypto.randomUUID()}`);
    await expect(s.getByText("Link nieaktywny")).toBeVisible();

    // Ponowne utworzenie: nowy token, inny niż oba poprzednie.
    await mealCard(page, LUNCH).getByRole("button", { name: "Utwórz link obsługi" }).click();
    await expect(mealCard(page, LUNCH).getByRole("button", { name: "Kopiuj link obsługi" })).toBeVisible();
    const third = (await mealByName(LUNCH))!.access_token;
    expect(third).toBeTruthy();
    expect([first, second]).not.toContain(third);
    await staffCtx.close();
  });

  test("rozliczenie CSV: nagłówek i jeden wiersz na wydanie; anonim nie pobierze", async ({ page, browser }) => {
    const { eventId, slug } = await ensureEvent();
    const lunch = (await mealByName(LUNCH))!;
    await page.goto(`/admin/events/${eventId}/meals`);

    const { filename, lines, raw } = await downloadCsv(page, LUNCH);
    expect(raw.startsWith("﻿")).toBe(true);
    expect(filename).toBe(`posilek-${slug}-${lunch.id.slice(0, 8)}.csv`);
    expect(lines[0]).toBe("Lp.;Imię i nazwisko;Firma;Godzina wydania");
    const body = lines.slice(1).filter(Boolean);
    expect(body).toHaveLength(2);
    // Kolejność według godziny wydania: Agata (organizator), potem Celina (obsługa).
    expect(body[0]).toMatch(/^1;Agata Obiadowa;Firma Lunch;"\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}"$/);
    expect(body[1]).toMatch(/^2;Celina Obiadowa;;"\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}"$/);

    // Pusty posiłek: tylko nagłówek.
    await addMealViaUi(page, EMPTY_MEAL);
    const empty = await downloadCsv(page, EMPTY_MEAL);
    expect(empty.lines.filter(Boolean)).toEqual(["Lp.;Imię i nazwisko;Firma;Godzina wydania"]);

    // Osoba bez sesji: brak CSV (przekierowanie do logowania albo 404).
    const anonCtx = await browser.newContext(NO_SESSION);
    const res = await anonCtx.request.get(`/admin/events/${eventId}/meals/${lunch.id}/rozliczenie.csv`, { maxRedirects: 0 });
    expect(res.status()).not.toBe(200);
    expect(res.headers()["content-type"] ?? "").not.toContain("text/csv");
    expect(await res.text()).not.toContain("Obiadowa");
    const p = await anonCtx.newPage();
    await p.goto(`/admin/events/${eventId}/meals/${lunch.id}`);
    await expect(p).not.toHaveURL(new RegExp(`/meals/${lunch.id}$`));
    await expect(p.getByText("Agata Obiadowa")).toHaveCount(0);
    await anonCtx.close();
  });

  test("usuwanie: posiłek z wydaniami bez „Usuń” i odmowa akcji, pusty da się usunąć", async ({ page }) => {
    const { eventId } = await ensureEvent();
    await page.goto(`/admin/events/${eventId}/meals`);
    await expect(mealCard(page, LUNCH).getByRole("button", { name: "Usuń" })).toHaveCount(0);
    await expect(mealCard(page, DINNER).getByRole("button", { name: "Usuń" })).toHaveCount(0);

    // Akcja usunięcia wywołana dla posiłku, który w międzyczasie dostał wydanie (nieaktualny widok).
    await addMealViaUi(page, RACE_MEAL);
    const race = (await mealByName(RACE_MEAL))!;
    await expect(mealCard(page, RACE_MEAL).getByRole("button", { name: "Usuń" })).toBeVisible();
    const { error } = await admin()
      .from("meal_redemptions")
      .insert({ meal_id: race.id, attendee_id: await attendeeId("Agata", "Obiadowa"), redeemed_by: "staff" });
    expect(error).toBeNull();
    await mealCard(page, RACE_MEAL).getByRole("button", { name: "Usuń" }).click();
    await expect(page.getByText("Nie można usunąć posiłku, który ma już wydania.")).toBeVisible();
    expect(await mealByName(RACE_MEAL)).not.toBeNull();
    expect(await redemptions(race.id)).toHaveLength(1);
    await page.reload();
    await expect(mealCard(page, RACE_MEAL).getByText("Wydano: 1")).toBeVisible();
    await expect(mealCard(page, RACE_MEAL).getByRole("button", { name: "Usuń" })).toHaveCount(0);

    // Pusty posiłek znika z listy i z bazy.
    const empty = (await mealByName(EMPTY_MEAL))!;
    await mealCard(page, EMPTY_MEAL).getByRole("button", { name: "Usuń" }).click();
    await expect(mealCard(page, EMPTY_MEAL)).toHaveCount(0);
    expect(await mealByName(EMPTY_MEAL)).toBeNull();
    await page.goto(`/admin/events/${eventId}/meals/${empty.id}`);
    await expect(page.getByRole("heading", { name: EMPTY_MEAL })).toHaveCount(0);
  });

  test("usunięty uczestnik: wydanie zostaje w liczniku i w CSV jako „Dane usunięte”", async ({ page }) => {
    const { eventId } = await ensureEvent();
    const lunch = (await mealByName(LUNCH))!;
    const celinaId = await attendeeId("Celina", "Obiadowa");
    const { error } = await admin().from("attendees").delete().eq("id", celinaId);
    expect(error).toBeNull();

    const rows = await redemptions(lunch.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.attendee_id === null)).toHaveLength(1);

    await page.goto(`/admin/events/${eventId}/meals`);
    await expect(mealCard(page, LUNCH).getByText("Wydano: 2")).toBeVisible();
    const { lines } = await downloadCsv(page, LUNCH);
    const body = lines.slice(1).filter(Boolean);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatch(/^1;Agata Obiadowa;Firma Lunch;/);
    expect(body[1]).toMatch(/^2;Dane usunięte;;"\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}"$/);
    expect(lines.join("\n")).not.toContain("Celina");

    // Panel wydawania: Celiny nie ma już na liście (2 zatwierdzone osoby).
    await page.goto(`/admin/events/${eventId}/meals/${lunch.id}`);
    await expect(page.getByText("Celina Obiadowa")).toHaveCount(0);
    await expect(mealCounter(page)).toHaveText(/^\s*1\s*\/\s*2 wydano\s*$/);
  });

  test("izolacja: posiłek innego wydarzenia niedostępny pod tym wydarzeniem, klucz anon nie czyta tabel posiłków", async ({ page }) => {
    const { eventId } = await ensureEvent();
    const db = admin();
    const other = state().events.open;
    const { data: foreign, error } = await db
      .from("event_meals")
      .insert({ event_id: other.id, name: "E2E13 Obcy posiłek" })
      .select("id, access_token")
      .single();
    expect(error).toBeNull();

    // Panel i CSV pod cudzym eventId: 404, bez danych.
    await page.goto(`/admin/events/${eventId}/meals/${foreign!.id}`);
    await expect(page.getByRole("heading", { name: "E2E13 Obcy posiłek" })).toHaveCount(0);
    const res = await page.request.get(`/admin/events/${eventId}/meals/${foreign!.id}/rozliczenie.csv`);
    expect(res.status()).toBe(404);
    await page.goto(`/admin/events/${eventId}/meals`);
    await expect(mealCard(page, "E2E13 Obcy posiłek")).toHaveCount(0);

    // RLS deny-all: publiczny klucz nie widzi ani posiłków (z tokenami), ani wydań.
    const { data: meals } = await anon().from("event_meals").select("id, access_token");
    expect(meals ?? []).toHaveLength(0);
    const { data: reds } = await anon().from("meal_redemptions").select("id");
    expect(reds ?? []).toHaveLength(0);
    const { error: insErr } = await anon().from("event_meals").insert({ event_id: eventId, name: "anon" });
    expect(insErr).not.toBeNull();
  });

  test("recepcja: link obsługi na adresie apex /e/{slug}/recepcja/{token}, bez subdomeny", async ({ page, browser }) => {
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
    const token = (await readToken())!;
    const expected = `http://localhost:3100/e/${slug}/recepcja/${token}`;
    await expect(copy).toHaveAttribute("title", expected);
    expect(await copy.getAttribute("title")).not.toContain(`${slug}.`);

    // Ten adres działa dla obsługi bez logowania.
    const staffCtx = await browser.newContext(NO_SESSION);
    const s = await staffCtx.newPage();
    await s.goto(expected);
    await expect(s.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
    await expect(s.getByText("Agata Obiadowa")).toBeVisible();
    await staffCtx.close();
  });
});
