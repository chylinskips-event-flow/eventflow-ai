import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { admin, loginWithMagicLink, state } from "../helpers";

// Business Mixer: organizator tworzy mixer, dodaje uczestników, ustawia parametry,
// generuje i blokuje plan, eksportuje XLSX, uruchamia tryb na żywo; uczestnik widzi
// swój stół, rzutnik /p/{token} pokazuje stoliki aktywnej rundy.

test.describe.configure({ mode: "serial" });

// Własna sesja organizatora (plik 03 może nie być uruchomiony). Plik poza repozytorium.
const ORGANIZER_STATE = path.join(os.tmpdir(), "eventro-e2e-organizer-05.json");
// Uczestnik i rzutnik otwierają strony w czystej przeglądarce, bez sesji organizatora.
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const MIXER_NAME = "Mixer E2E 05";
const LAST_NAME = "Mikser05";
const FIRST_NAMES = ["Adam", "Beata", "Cezary", "Dorota", "Emil", "Felicja", "Gustaw", "Halina"];
const ROUNDS = 3;

const displayName = (first: string) => `${first} ${LAST_NAME}`;

type MixerDb = {
  id: string;
  status: string;
  present_token: string;
  rounds_count: number;
  table_count: number;
  seat_min: number;
  seat_max: number;
  break_after_round: number | null;
};

async function mixerRow(): Promise<MixerDb> {
  const { events } = state();
  const { data, error } = await admin()
    .from("mixers")
    .select("id, status, present_token, rounds_count, table_count, seat_min, seat_max, break_after_round")
    .eq("event_id", events.open.id)
    .eq("name", MIXER_NAME)
    .single();
  if (error || !data) throw new Error(`mixer ${MIXER_NAME}: ${error?.message ?? "brak"}`);
  return data as MixerDb;
}

async function mixerAttendees() {
  const { events } = state();
  const { data, error } = await admin()
    .from("attendees")
    .select("id, first_name, qr_code_token")
    .eq("event_id", events.open.id)
    .eq("last_name", LAST_NAME)
    .order("first_name");
  if (error) throw new Error(error.message);
  return data as { id: string; first_name: string; qr_code_token: string }[];
}

/** Przydziały planu: round → table → display_name[], oraz attendee → (round → table). */
async function loadPlan(mixerId: string) {
  const db = admin();
  const [{ data: assignments }, { data: participants }] = await Promise.all([
    db.from("mixer_assignments").select("round_number, table_number, participant_id").eq("mixer_id", mixerId),
    db.from("mixer_participants").select("id, attendee_id, display_name, status").eq("mixer_id", mixerId),
  ]);
  const byId = new Map((participants ?? []).map((p) => [p.id as string, p as { id: string; attendee_id: string; display_name: string; status: string }]));
  const tables = new Map<string, string[]>(); // "r:t" → names
  const pathOf = new Map<string, Map<number, number>>(); // attendee_id → round → table
  for (const a of (assignments ?? []) as { round_number: number; table_number: number; participant_id: string }[]) {
    const p = byId.get(a.participant_id)!;
    const key = `${a.round_number}:${a.table_number}`;
    tables.set(key, [...(tables.get(key) ?? []), p.display_name]);
    if (!pathOf.has(p.attendee_id)) pathOf.set(p.attendee_id, new Map());
    pathOf.get(p.attendee_id)!.set(a.round_number, a.table_number);
  }
  return { assignments: (assignments ?? []) as { round_number: number; table_number: number; participant_id: string }[], participants: participants ?? [], tables, pathOf };
}

/** Kontener nagłówka strony mixera (tytuł + odznaka statusu) — odznaki statusu uczestników są gdzie indziej. */
function mixerHeader(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 1, name: MIXER_NAME, exact: true }) })
    .last();
}

test("logowanie organizatora (sesja dla testów mixera)", async ({ page }) => {
  const { organizerEmail, events } = state();
  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(events.open.name).first()).toBeVisible();
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("Business Mixer", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("organizator tworzy mixer dla wydarzenia (szkic z domyślnymi parametrami)", async ({ page }) => {
    const { events } = state();
    // 8 zatwierdzonych uczestników wydarzenia — kandydaci do mixera.
    const { error } = await admin()
      .from("attendees")
      .insert(
        FIRST_NAMES.map((first, i) => ({
          event_id: events.open.id,
          first_name: first,
          last_name: LAST_NAME,
          company: `Firma ${i + 1}`,
          email: `${first.toLowerCase()}.mikser.05@e2e.test`,
          status: "approved",
        })),
      );
    expect(error?.message).toBeUndefined();

    await page.goto(`/admin/events/${events.open.id}/mixer`);
    await expect(page.getByRole("heading", { level: 1, name: "Business Mixer" })).toBeVisible();
    await page.getByRole("button", { name: "Nowy mixer", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Nowy Business Mixer" })).toBeVisible();
    await dialog.getByLabel("Nazwa").fill(MIXER_NAME);
    await dialog.getByRole("button", { name: "Utwórz mixer" }).click();
    await expect(dialog.getByText("Mixer utworzony.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const link = page.getByRole("link", { name: new RegExp(MIXER_NAME) });
    await expect(link).toBeVisible();
    await expect(link).toContainText("Szkic");

    const mixer = await mixerRow();
    expect(mixer.status).toBe("draft");
    expect(mixer.present_token).toBeTruthy();

    // Szczegóły: zakładka „Plan” nieaktywna, dopóki nie ma planu.
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/mixer/${mixer.id}`));
    await expect(mixerHeader(page).getByText("Szkic", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Brak uczestników — dodaj ich z listy zarejestrowanych.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generuj plan" })).toBeDisabled();
  });

  test("dodanie 8 uczestników z listy i ustawienie parametrów stolików", async ({ page }) => {
    const { events } = state();
    const mixer = await mixerRow();
    await page.goto(`/admin/events/${events.open.id}/mixer/${mixer.id}`);

    await page.getByRole("button", { name: "Dodaj z listy" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Dodaj uczestników" })).toBeVisible();
    await dialog.getByPlaceholder("Szukaj...").fill(LAST_NAME);
    const boxes = dialog.getByRole("checkbox");
    await expect(boxes).toHaveCount(FIRST_NAMES.length);
    for (const first of FIRST_NAMES) {
      await dialog.getByRole("checkbox", { name: new RegExp(displayName(first)) }).check();
    }
    await expect(dialog.getByText(`${FIRST_NAMES.length} zaznaczonych`)).toBeVisible();
    await dialog.getByRole("button", { name: `Dodaj (${FIRST_NAMES.length})` }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("tab", { name: `Uczestnicy (${FIRST_NAMES.length})` })).toBeVisible();
    for (const first of FIRST_NAMES) {
      await expect(page.getByRole("cell", { name: displayName(first), exact: true })).toBeVisible();
    }
    const { data: participants } = await admin()
      .from("mixer_participants")
      .select("display_name, company, status")
      .eq("mixer_id", mixer.id);
    expect(participants).toHaveLength(FIRST_NAMES.length);
    expect(participants!.every((p) => p.status === "active")).toBe(true);
    expect(participants!.map((p) => p.display_name).sort()).toEqual(FIRST_NAMES.map(displayName).sort());

    // Domyślnie 8 stolików po 4–6 os. — dla 8 osób: 2 stoliki po 3–5 os., 3 rundy, bez przerwy.
    await page.goto(`/admin/events/${events.open.id}/mixer/${mixer.id}?tab=parametry`);
    const params = page.locator("#mixer-tabpanel-parametry");
    await params.getByLabel("Liczba stolików").fill("2");
    await params.getByLabel("Min os. / stół").fill("3");
    await params.getByLabel("Max os. / stół").fill("5");
    await params.getByLabel("Liczba rund").fill(String(ROUNDS));
    await params.getByLabel("Przerwa po rundzie").fill("");
    await expect(params.getByText("OK — 2×4 os./stół (2 stoliki aktywne)")).toBeVisible();
    await params.getByRole("button", { name: "Zapisz parametry" }).click();
    await expect(params.getByText("Parametry zapisane.")).toBeVisible();

    const saved = await mixerRow();
    expect(saved).toMatchObject({ table_count: 2, seat_min: 3, seat_max: 5, rounds_count: ROUNDS, break_after_round: null });
  });

  test("generowanie planu: każdy uczestnik raz w rundzie, plan widoczny, blokada planu", async ({ page }) => {
    const { events } = state();
    const mixer = await mixerRow();
    await page.goto(`/admin/events/${events.open.id}/mixer/${mixer.id}`);

    await page.getByRole("button", { name: "Generuj plan" }).click();
    await expect(mixerHeader(page).getByText("Wygenerowany", { exact: true })).toBeVisible();

    const generated = await mixerRow();
    expect(generated.status).toBe("generated");
    const plan = await loadPlan(mixer.id);
    expect(plan.assignments).toHaveLength(FIRST_NAMES.length * ROUNDS);
    for (let r = 1; r <= ROUNDS; r++) {
      const inRound = plan.assignments.filter((a) => a.round_number === r);
      expect(new Set(inRound.map((a) => a.participant_id)).size, `runda ${r}: każdy raz`).toBe(FIRST_NAMES.length);
      for (const t of new Set(inRound.map((a) => a.table_number))) {
        const size = inRound.filter((a) => a.table_number === t).length;
        expect(size, `runda ${r}, stół ${t}`).toBeGreaterThanOrEqual(3);
        expect(size, `runda ${r}, stół ${t}`).toBeLessThanOrEqual(5);
      }
    }
    const { data: rounds } = await admin().from("mixer_rounds").select("round_number, status").eq("mixer_id", mixer.id);
    expect(rounds).toHaveLength(ROUNDS);
    expect(rounds!.every((r) => r.status === "pending")).toBe(true);
    const { data: icebreakers } = await admin().from("mixer_icebreakers").select("id").eq("mixer_id", mixer.id);
    expect(icebreakers!.length).toBeGreaterThan(0);

    // Zakładka „Plan” aktywna i pokazuje rundy ze stolikami.
    const planTab = page.getByRole("tab", { name: "Plan" });
    await expect(planTab).not.toHaveAttribute("aria-disabled", "true");
    await planTab.click();
    const planPanel = page.locator("#mixer-tabpanel-plan");
    for (let r = 1; r <= ROUNDS; r++) {
      await expect(planPanel.getByRole("heading", { name: `Runda ${r}`, exact: true })).toBeVisible();
    }
    await expect(planPanel.getByText("Stół 1", { exact: true }).first()).toBeVisible();
    await expect(planPanel.getByText("Stół 2", { exact: true }).first()).toBeVisible();
    await expect(planPanel.getByRole("link", { name: "Eksportuj do arkusza" })).toBeVisible();

    // Blokada planu.
    await page.getByRole("button", { name: "Zablokuj", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText("Zablokować plan?")).toBeVisible();
    await confirm.getByRole("button", { name: "Zablokuj" }).click();
    await expect(mixerHeader(page).getByText("Zablokowany", { exact: true })).toBeVisible();
    await expect(page.getByText(/Plan zablokowany — edycja wyłączona/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Generuj plan" })).toHaveCount(0);
    expect((await mixerRow()).status).toBe("locked");

    // Zablokowany plan: dodawanie uczestników wyłączone.
    await page.goto(`/admin/events/${events.open.id}/mixer/${mixer.id}?tab=uczestnicy`);
    await expect(page.getByRole("button", { name: "Dodaj z listy" })).toBeDisabled();
  });

  test("eksport XLSX: plik z planem dla organizatora, brak pliku bez logowania", async ({ page, browser }) => {
    const { events } = state();
    const mixer = await mixerRow();
    const exportPath = `/admin/events/${events.open.id}/mixer/${mixer.id}/export`;

    await page.goto(`/admin/events/${events.open.id}/mixer/${mixer.id}?tab=plan`);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Eksportuj do arkusza" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("mixer-mixer-e2e-05-plan.xlsx");

    const res = await page.request.get(exportPath);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.headers()["content-disposition"]).toMatch(/attachment;.*\.xlsx/);
    const body = await res.body();
    expect(body.subarray(0, 2).toString()).toBe("PK"); // XLSX = archiwum ZIP

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Wg rundy", "Wg stołu", "Ścieżki uczestników", "Raport jakości"]);

    const byRound = wb.getWorksheet("Wg rundy")!;
    expect(byRound.rowCount).toBe(1 + FIRST_NAMES.length * ROUNDS);

    const paths = wb.getWorksheet("Ścieżki uczestników")!;
    expect(paths.getRow(1).values).toEqual(expect.arrayContaining(["Uczestnik", "Firma", "R1", "R2", "R3"]));
    const names: string[] = [];
    const plan = await loadPlan(mixer.id);
    const attendees = await mixerAttendees();
    for (let i = 2; i <= paths.rowCount; i++) {
      const row = paths.getRow(i);
      const name = String(row.getCell(1).value);
      names.push(name);
      const attendee = attendees.find((a) => displayName(a.first_name) === name)!;
      for (let r = 1; r <= ROUNDS; r++) {
        expect(Number(row.getCell(2 + r).value), `${name}, runda ${r}`).toBe(plan.pathOf.get(attendee.id)!.get(r));
      }
    }
    expect(names.sort()).toEqual(FIRST_NAMES.map(displayName).sort());

    // Bez sesji organizatora plik z danymi uczestników nie może być dostępny.
    const anonymous = await browser.newContext(NO_SESSION);
    const anonRes = await anonymous.request.get(exportPath);
    expect(anonRes.headers()["content-type"] ?? "").not.toContain("spreadsheetml");
    expect((await anonRes.body()).subarray(0, 2).toString()).not.toBe("PK");
    await anonymous.close();
  });

  test("start trybu na żywo: rzutnik czeka, po starcie runda 1 aktywna", async ({ page, browser }) => {
    const { events } = state();
    const mixer = await mixerRow();

    // Rzutnik przed startem: ekran oczekiwania.
    const projectorCtx = await browser.newContext(NO_SESSION);
    const projector = await projectorCtx.newPage();
    await projector.goto(`/p/${mixer.present_token}`);
    await expect(projector.getByRole("heading", { level: 1, name: MIXER_NAME })).toBeVisible();
    await expect(projector.getByText("Mixer zaraz się rozpocznie")).toBeVisible();
    await expect(projector.getByText("Oczekiwanie na start")).toBeVisible();

    await page.goto(`/admin/events/${events.open.id}/mixer/${mixer.id}`);
    await expect(page.getByRole("link", { name: "Rzutnik" })).toHaveAttribute("href", `/p/${mixer.present_token}`);

    await page.getByRole("button", { name: "Start mixera" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText("Uruchomić mixer?")).toBeVisible();
    await confirm.getByRole("button", { name: "Uruchom" }).click();
    await expect(confirm).toBeHidden();

    await expect(mixerHeader(page).getByText("Aktywny", { exact: true })).toBeVisible();
    await expect(page.getByText(/Runda 1\s*\/\s*3/)).toBeVisible();
    await expect(page.getByText(/Mixer w trakcie biegu/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Następna runda" })).toBeVisible();

    expect((await mixerRow()).status).toBe("running");
    const { data: rounds } = await admin()
      .from("mixer_rounds")
      .select("round_number, status, started_at")
      .eq("mixer_id", mixer.id)
      .order("round_number");
    expect(rounds!.map((r) => r.status)).toEqual(["active", "pending", "pending"]);
    expect(rounds![0].started_at).not.toBeNull();

    // Rzutnik po odświeżeniu: runda 1 ze stolikami.
    await projector.reload();
    await expect(projector.getByText("Mixer zaraz się rozpocznie")).toHaveCount(0);
    await expect(projector.locator("header")).toContainText("1/3");
    await projectorCtx.close();
  });

  test("uczestnik widzi swój stół i współbiesiadników na /e/{slug}/mixer", async ({ browser }) => {
    const { events } = state();
    const mixer = await mixerRow();
    const plan = await loadPlan(mixer.id);
    const [me] = await mixerAttendees();
    const myPath = plan.pathOf.get(me.id)!;
    const t1 = myPath.get(1)!;
    const mates1 = plan.tables.get(`1:${t1}`)!.filter((n) => n !== displayName(me.first_name));
    expect(mates1.length).toBeGreaterThanOrEqual(2);

    const phone = await browser.newContext(NO_SESSION);
    const p = await phone.newPage();
    await p.goto(`/e/${events.open.slug}/a/${me.qr_code_token}`);
    await expect(p.getByText(new RegExp(`Cześć, ${me.first_name}`))).toBeVisible();

    await p.goto(`/e/${events.open.slug}/mixer`);
    await expect(p).toHaveURL(new RegExp(`/e/${events.open.slug}/mixer`));
    await expect(p.getByText(MIXER_NAME).first()).toBeVisible();

    // Duży blok „Teraz”: aktywna runda i stół.
    await expect(p.getByText("Teraz", { exact: true }).first()).toBeVisible();
    await expect(p.getByText(`→ Stół ${t1}`)).toBeVisible();

    // Karta rundy 1: na żywo, mój stół, osoby przy stole.
    const card1 = p.locator('[data-slot="card"]').filter({ hasText: "Runda 1" });
    await expect(card1.getByText("Na żywo")).toBeVisible();
    await expect(card1.getByText(`Stół ${t1}`, { exact: true })).toBeVisible();
    for (const name of mates1) {
      await expect(card1.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(card1.getByText(displayName(me.first_name), { exact: true })).toHaveCount(0);

    // Pozostałe rundy: zaplanowane stoły.
    for (let r = 2; r <= ROUNDS; r++) {
      const card = p.locator('[data-slot="card"]').filter({ hasText: `Runda ${r}` });
      await expect(card.getByText(`Stół ${myPath.get(r)}`, { exact: true })).toBeVisible();
      await expect(card.getByText("Na żywo")).toHaveCount(0);
    }
    await phone.close();

    // Uczestnik wydarzenia spoza mixera nie dostaje widoku mixera.
    const { data: outsider } = await admin()
      .from("attendees")
      .insert({ event_id: events.open.id, first_name: "Olaf", last_name: "Obserwator05", email: "olaf.obserwator.05@e2e.test", status: "approved" })
      .select("qr_code_token")
      .single();
    const other = await browser.newContext(NO_SESSION);
    const o = await other.newPage();
    await o.goto(`/e/${events.open.slug}/a/${outsider!.qr_code_token}`);
    await expect(o.getByText(/Cześć, Olaf/)).toBeVisible();
    await o.goto(`/e/${events.open.slug}/mixer`);
    await expect(o).not.toHaveURL(/\/mixer/);
    await expect(o.getByText(MIXER_NAME)).toHaveCount(0);
    await other.close();
  });

  test("rzutnik /p/{token} bez logowania: stoliki aktywnej rundy, zły token = 404", async ({ browser }) => {
    const mixer = await mixerRow();
    const plan = await loadPlan(mixer.id);

    const ctx = await browser.newContext(NO_SESSION);
    const screen = await ctx.newPage();
    const res = await screen.goto(`/p/${mixer.present_token}`);
    expect(res?.status()).toBe(200);
    await expect(screen.getByText("Business Mixer", { exact: true })).toBeVisible();
    await expect(screen.getByRole("heading", { level: 1, name: MIXER_NAME })).toBeVisible();
    await expect(screen.locator("header")).toContainText("1/3");

    for (const t of [1, 2]) {
      const card = screen.locator("div.rounded-2xl").filter({ has: screen.getByText(`Stół ${t}`, { exact: true }) });
      await expect(card).toBeVisible();
      for (const name of plan.tables.get(`1:${t}`)!) {
        await expect(card.getByText(name, { exact: true })).toBeVisible();
      }
    }
    // Rzutnik nie pokazuje danych kontaktowych.
    await expect(screen.getByText(/@e2e\.test/)).toHaveCount(0);

    const bad = await screen.goto(`/p/${crypto.randomUUID()}`);
    expect(bad?.status()).toBe(404);
    await expect(screen.getByText(MIXER_NAME)).toHaveCount(0);
    await ctx.close();
  });

  test("następna runda: organizator przełącza, uczestnik i rzutnik widzą rundę 2", async ({ page, browser }) => {
    const { events } = state();
    const mixer = await mixerRow();
    await page.goto(`/admin/events/${events.open.id}/mixer/${mixer.id}`);
    await page.getByRole("button", { name: "Następna runda" }).click();
    await expect(page.getByText(/Runda 2\s*\/\s*3/)).toBeVisible();

    const { data: rounds } = await admin()
      .from("mixer_rounds")
      .select("round_number, status")
      .eq("mixer_id", mixer.id)
      .order("round_number");
    expect(rounds!.map((r) => r.status)).toEqual(["done", "active", "pending"]);
    expect((await mixerRow()).status).toBe("running");

    const plan = await loadPlan(mixer.id);
    const [me] = await mixerAttendees();
    const t2 = plan.pathOf.get(me.id)!.get(2)!;

    const phone = await browser.newContext(NO_SESSION);
    const p = await phone.newPage();
    await p.goto(`/e/${events.open.slug}/a/${me.qr_code_token}`);
    await expect(p.getByText(new RegExp(`Cześć, ${me.first_name}`))).toBeVisible();
    await p.goto(`/e/${events.open.slug}/mixer`);
    await expect(p.getByText(`→ Stół ${t2}`)).toBeVisible();
    const card1 = p.locator('[data-slot="card"]').filter({ hasText: "Runda 1" });
    const card2 = p.locator('[data-slot="card"]').filter({ hasText: "Runda 2" });
    await expect(card1.getByText("Zakończona")).toBeVisible();
    await expect(card2.getByText("Na żywo")).toBeVisible();

    const screen = await p.context().newPage();
    await screen.goto(`/p/${mixer.present_token}`);
    await expect(screen.locator("header")).toContainText("2/3");
    for (const name of plan.tables.get(`2:${t2}`)!) {
      await expect(screen.getByText(name, { exact: true })).toBeVisible();
    }
    await phone.close();
  });
});
