import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { admin, loginWithMagicLink, state } from "../helpers";

// Grywalizacja: quest „Odwiedziny stoiska” dodany w panelu → uczestnik skanuje QR stoiska
// (bezpośredni URL) → punkty i poziom → lista questów → ranking → wydanie nagrody
// z listy w panelu (magazyn maleje) → drugie wydanie tej samej nagrody tej samej osobie odrzucone.
//
// Plik jest niezależny od innych specyfikacji: własne logowanie organizatora, własny partner
// stoiska (aktywny quest stoiskowy musi być jedyny dla partnera, więc nie dzielimy seedowanego
// „Partner E2E” z innymi plikami), własni uczestnicy i nagrody.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-07.json";
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const PARTNER_NAME = "Partner Grywalizacja 07";
const QUEST_TITLE = "Odwiedź stoisko Grywalizacja 07";
const QUEST_POINTS = 150; // ≥ 100 → awans Explorer → Connector
const PLAYER = { first: "Gracjan", last: "Punktowy07", email: "gracjan.07@e2e.test" };
const RIVAL = { first: "Rywalka", last: "Rankingowa07", email: "rywalka.07@e2e.test", points: 40 };
const HIDDEN = { first: "Ukryty", last: "Niewidoczny07", email: "ukryty.07@e2e.test", points: 5000 };
const REWARD_NAME = "Kubek Eventro 07";
const REWARD_STOCK = 3;
const REWARD_POINTS = 100;
const SECOND_REWARD_NAME = "Notes Eventro 07";

// Dane wspólne dla testów w tym pliku (tryb serial, jeden worker).
let partner: { id: string; qr_code_token: string };
let player: { id: string; qr_code_token: string };
let questId: string;

async function insertAttendee(
  eventId: string,
  who: { first: string; last: string; email: string },
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await admin()
    .from("attendees")
    .insert({ event_id: eventId, first_name: who.first, last_name: who.last, email: who.email, status: "approved", ...extra })
    .select("id, qr_code_token")
    .single();
  if (error) throw new Error(`[07] uczestnik ${who.email}: ${error.message}`);
  return data as { id: string; qr_code_token: string };
}

/** Uczestnik w czystej przeglądarce (np. telefon) — sesja z linku wejściowego. */
async function participantPage(browser: Browser) {
  const { events } = state();
  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  // Serwer deweloperski Next przy pierwszej kompilacji trasy potrafi jednorazowo oddać 404
  // (zaobserwowane na /e/{slug}/a/{token}) — ponawiamy wejście, sama ścieżka jest poprawna.
  await expect(async () => {
    await page.goto(`/e/${events.open.slug}/a/${player.qr_code_token}`);
    await expect(page.getByText(new RegExp(`Cześć, ${PLAYER.first}`))).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  return { ctx, page };
}

/** Sekcja „Wydaj nagrodę uczestnikowi” z wybranym uczestnikiem (tryb ręczny — lista). */
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

test("logowanie organizatora i przygotowanie danych grywalizacji", async ({ page }) => {
  const { organizerEmail, events } = state();
  const db = admin();

  const { data: p, error: pErr } = await db
    .from("partners")
    .insert({ event_id: events.open.id, name: PARTNER_NAME, tier: "silver", description: "Stoisko do testów grywalizacji" })
    .select("id, qr_code_token")
    .single();
  if (pErr) throw new Error(`[07] partner: ${pErr.message}`);
  partner = p as { id: string; qr_code_token: string };
  expect(partner.qr_code_token, "partner ma token QR stoiska").toBeTruthy();

  player = await insertAttendee(events.open.id, PLAYER);
  await insertAttendee(events.open.id, RIVAL, { points: RIVAL.points });
  await insertAttendee(events.open.id, HIDDEN, { points: HIDDEN.points, networking_visible: false });

  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("grywalizacja", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("organizator dodaje quest „Odwiedziny stoiska” dla partnera", async ({ page }) => {
    const { events } = state();
    await page.goto(`/admin/events/${events.open.id}/quests`);
    await expect(page.getByRole("heading", { level: 1, name: "Questy" })).toBeVisible();

    await page.getByRole("button", { name: "Dodaj quest" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Dodaj quest" })).toBeVisible();
    // Domyślny typ to odwiedziny stoiska (skan QR).
    await expect(dialog.locator("#type")).toContainText("Odwiedziny stoiska (skan QR)");
    await dialog.locator("#title").fill(QUEST_TITLE);
    await dialog.locator("#description").fill("Zeskanuj kod QR przy stoisku.");
    await dialog.locator("#points_value").fill(String(QUEST_POINTS));
    await dialog.locator("#partner_id").click();
    await page.getByRole("option", { name: PARTNER_NAME }).click();
    await expect(dialog.locator("#partner_id")).toContainText(PARTNER_NAME);
    await dialog.getByRole("button", { name: "Dodaj quest" }).click();
    await expect(dialog).toBeHidden();

    const card = page.locator("[data-slot=card]", { hasText: QUEST_TITLE });
    await expect(card).toBeVisible();
    await expect(card.getByText("Odwiedziny stoiska", { exact: true })).toBeVisible();
    await expect(card.getByText(`${QUEST_POINTS} pkt`)).toBeVisible();
    await expect(card.getByText(`Partner: ${PARTNER_NAME}`)).toBeVisible();
    await expect(card.getByRole("button", { name: "Aktywny" })).toBeVisible();

    const { data, error } = await admin()
      .from("quests")
      .select("id, type, points_value, partner_id, is_active")
      .eq("event_id", events.open.id)
      .eq("title", QUEST_TITLE);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ type: "booth_visit", points_value: QUEST_POINTS, partner_id: partner.id, is_active: true });
    questId = data![0].id as string;
  });

  test("uczestnik skanuje QR stoiska: quest zaliczony, punkty i nowy poziom", async ({ browser }) => {
    const { events } = state();
    const { ctx, page } = await participantPage(browser);

    await page.goto(`/e/${events.open.slug}/booth/${partner.qr_code_token}`);
    await expect(page.getByText(PARTNER_NAME).first()).toBeVisible();
    await expect(page.getByText(QUEST_TITLE)).toBeVisible();
    await expect(page.getByText(`+${QUEST_POINTS} pkt`)).toBeVisible();

    await page.getByRole("button", { name: "Zarejestruj odwiedziny" }).click();
    await expect(page.getByText("Stoisko odwiedzone!")).toBeVisible();
    await expect(page.getByText(`+${QUEST_POINTS} pkt`)).toBeVisible();
    await expect(page.getByText("Nowy poziom: Connector!")).toBeVisible();
    await expect(page.getByText(`Dziękujemy za odwiedziny stoiska ${PARTNER_NAME}.`)).toBeVisible();

    const db = admin();
    const { data: me } = await db.from("attendees").select("points, level").eq("id", player.id).single();
    expect(me).toMatchObject({ points: QUEST_POINTS, level: "connector" });
    const { data: completions } = await db
      .from("quest_completions")
      .select("points_awarded")
      .eq("quest_id", questId)
      .eq("attendee_id", player.id);
    expect(completions).toEqual([{ points_awarded: QUEST_POINTS }]);
    const { data: checkins } = await db.from("checkins").select("id").eq("attendee_id", player.id).eq("partner_id", partner.id);
    expect(checkins).toHaveLength(1);
    await ctx.close();
  });

  test("ponowny skan tego samego stoiska nie dolicza punktów", async ({ browser }) => {
    const { events } = state();
    const { ctx, page } = await participantPage(browser);

    await page.goto(`/e/${events.open.slug}/booth/${partner.qr_code_token}`);
    await expect(page.getByText("Stoisko już odwiedzone")).toBeVisible();
    await expect(page.getByText(`Punkty zaliczone: ${QUEST_POINTS}`)).toBeVisible();
    await expect(page.getByText(/Twój poziom: connector/i)).toBeVisible();
    // Brak formularza — nie da się zaliczyć drugi raz.
    await expect(page.getByRole("button", { name: "Zarejestruj odwiedziny" })).toHaveCount(0);

    const db = admin();
    const { data: me } = await db.from("attendees").select("points").eq("id", player.id).single();
    expect(me?.points).toBe(QUEST_POINTS);
    const { data: completions } = await db.from("quest_completions").select("quest_id").eq("quest_id", questId).eq("attendee_id", player.id);
    expect(completions).toHaveLength(1);
    await ctx.close();
  });

  test("lista questów uczestnika pokazuje zaliczenie i stan punktów", async ({ browser }) => {
    const { events } = state();
    const { ctx, page } = await participantPage(browser);

    await page.goto(`/e/${events.open.slug}/quests`);
    const card = page.locator("[data-slot=card]", { hasText: QUEST_TITLE });
    await expect(card).toBeVisible();
    await expect(card.getByText(`✓ Zdobyte ${QUEST_POINTS} pkt`)).toBeVisible();
    await expect(card.getByText(`+${QUEST_POINTS} pkt`)).toHaveCount(0);
    await expect(card.getByText(PARTNER_NAME)).toBeVisible();
    // Pasek punktów i poziomu uczestnika.
    await expect(page.getByText(`${QUEST_POINTS} pkt`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Connector", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`${QUEST_POINTS} / 250 pkt → Networker`)).toBeVisible();
    await ctx.close();
  });

  test("ranking pokazuje uczestnika z punktami; osoby ukryte w networkingu bez nazwiska", async ({ browser }) => {
    const { events } = state();
    const { ctx, page } = await participantPage(browser);

    await page.goto(`/e/${events.open.slug}/ranking`);
    await expect(page.getByRole("heading", { level: 1, name: "Ranking" })).toBeVisible();

    const me = page.locator("[data-slot=card]", { hasText: `${PLAYER.first} ${PLAYER.last}` });
    await expect(me).toBeVisible();
    await expect(me.getByText("(Ty)")).toBeVisible();
    await expect(me.getByText(`${QUEST_POINTS} pkt`)).toBeVisible();
    await expect(me.getByText("Connector", { exact: true })).toBeVisible();

    const rival = page.locator("[data-slot=card]", { hasText: `${RIVAL.first} ${RIVAL.last}` });
    await expect(rival).toBeVisible();
    await expect(rival.getByText(`${RIVAL.points} pkt`)).toBeVisible();
    await expect(rival.getByText("(Ty)")).toHaveCount(0);

    // Kolejność według punktów: uczestnik (150) przed rywalką (40).
    const names = await page.locator("[data-slot=card]").allTextContents();
    const myIdx = names.findIndex((t) => t.includes(PLAYER.last));
    const rivalIdx = names.findIndex((t) => t.includes(RIVAL.last));
    expect(myIdx).toBeGreaterThanOrEqual(0);
    expect(myIdx).toBeLessThan(rivalIdx);

    // Osoba z wyłączoną widocznością w networkingu nie pojawia się z imienia i nazwiska.
    await expect(page.getByText(HIDDEN.last)).toHaveCount(0);
    await ctx.close();
  });

  test("organizator wydaje nagrodę z listy: magazyn maleje, uczestnik widzi odbiór", async ({ page, browser }) => {
    const { events } = state();
    await page.goto(`/admin/events/${events.open.id}/rewards`);
    await expect(page.getByRole("heading", { level: 1, name: "Nagrody" })).toBeVisible();

    // Nowa nagroda przez formularz panelu.
    await page.getByRole("button", { name: "Dodaj nagrodę" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#name").fill(REWARD_NAME);
    await dialog.locator("#points_required").fill(String(REWARD_POINTS));
    await dialog.locator("#stock").fill(String(REWARD_STOCK));
    await dialog.getByRole("button", { name: "Dodaj nagrodę" }).click();
    await expect(dialog).toBeHidden();

    const rewardCard = page
      .locator("[data-slot=card]", { hasText: REWARD_NAME })
      .filter({ hasNotText: "Wydaj nagrodę uczestnikowi" });
    await expect(rewardCard.getByText(`Magazyn: ${REWARD_STOCK} szt.`)).toBeVisible();
    await expect(rewardCard.getByText("Wydano: 0")).toBeVisible();

    const { data: reward } = await admin().from("rewards").select("id, stock").eq("event_id", events.open.id).eq("name", REWARD_NAME).single();
    expect(reward?.stock).toBe(REWARD_STOCK);

    // Wydanie z listy uczestników.
    const section = await redeemSectionFor(page, `${PLAYER.first} ${PLAYER.last}`);
    const row = redeemRow(section, REWARD_NAME);
    await expect(row.getByText(`Magazyn: ${REWARD_STOCK} szt.`)).toBeVisible();
    await row.getByRole("button", { name: "Wydaj" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText("Wydać nagrodę?")).toBeVisible();
    await expect(confirm.getByText(`Pozostały magazyn po wydaniu: ${REWARD_STOCK - 1} szt.`)).toBeVisible();
    await confirm.getByRole("button", { name: "Potwierdź" }).click();
    await expect(section.getByText("Nagroda wydana.")).toBeVisible();

    await expect
      .poll(async () => (await admin().from("rewards").select("stock").eq("id", reward!.id).single()).data?.stock)
      .toBe(REWARD_STOCK - 1);
    const { data: redemptions } = await admin().from("reward_redemptions").select("attendee_id").eq("reward_id", reward!.id);
    expect(redemptions).toEqual([{ attendee_id: player.id }]);

    // Panel po odświeżeniu danych: stan magazynu i licznik wydań.
    await expect(rewardCard.getByText(`Magazyn: ${REWARD_STOCK - 1} szt.`)).toBeVisible();
    await expect(rewardCard.getByText("Wydano: 1")).toBeVisible();
    await expect(row.getByRole("button", { name: "Odebrana" })).toBeDisabled();
    await expect(row.getByText(/Już odebrana/)).toBeVisible();

    // Uczestnik widzi odbiór na swojej stronie nagród.
    const { ctx, page: p } = await participantPage(browser);
    await p.goto(`/e/${events.open.slug}/rewards`);
    await expect(p.getByText("Moje odbiory")).toBeVisible();
    const myReward = p.locator("[data-slot=card]", { hasText: REWARD_NAME });
    await expect(myReward.getByText("Odebrano")).toBeVisible();
    await ctx.close();
  });

  test("drugie wydanie tej samej nagrody tej samej osobie jest odrzucone", async ({ page }) => {
    test.fail(true, "BŁĄD APLIKACJI: odrzucone ponowne wydanie nagrody zwiększa magazyn o 1 (cofnięcie dekrementacji ustawia stock = odczytany stan + 1 zamiast odczytanego stanu; rewards/actions.ts:247)");
    const { events } = state();
    const { data: reward, error } = await admin()
      .from("rewards")
      .insert({ event_id: events.open.id, name: SECOND_REWARD_NAME, points_required: 50, stock: 5 })
      .select("id")
      .single();
    if (error) throw new Error(`[07] nagroda: ${error.message}`);

    // Dwie karty panelu otwarte jednocześnie (np. dwie osoby na stoisku nagród).
    const stale = await page.context().newPage();
    await page.goto(`/admin/events/${events.open.id}/rewards`);
    await stale.goto(`/admin/events/${events.open.id}/rewards`);
    const name = `${PLAYER.first} ${PLAYER.last}`;
    const section = await redeemSectionFor(page, name);
    const staleSection = await redeemSectionFor(stale, name);

    // Pierwsze wydanie — OK.
    await redeemRow(section, SECOND_REWARD_NAME).getByRole("button", { name: "Wydaj" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Potwierdź" }).click();
    await expect(section.getByText("Nagroda wydana.")).toBeVisible();
    await expect(redeemRow(section, SECOND_REWARD_NAME).getByRole("button", { name: "Odebrana" })).toBeDisabled();

    // Druga karta ma jeszcze stary widok z aktywnym „Wydaj” — serwer musi odmówić.
    await redeemRow(staleSection, SECOND_REWARD_NAME).getByRole("button", { name: "Wydaj" }).click();
    await stale.getByRole("alertdialog").getByRole("button", { name: "Potwierdź" }).click();
    await expect(staleSection.getByText("Uczestnik już odebrał tę nagrodę.")).toBeVisible();
    await expect(staleSection.getByText("Nagroda wydana.")).toHaveCount(0);

    const db = admin();
    const { data: after } = await db.from("rewards").select("stock").eq("id", reward!.id).single();
    expect(after?.stock, "odrzucone wydanie nie zmniejsza magazynu").toBe(4);
    const { data: redemptions } = await db.from("reward_redemptions").select("attendee_id").eq("reward_id", reward!.id);
    expect(redemptions).toHaveLength(1);

    // Po odświeżeniu przycisk jest zablokowany także w drugiej karcie.
    await stale.reload();
    const fresh = await redeemSectionFor(stale, name);
    await expect(redeemRow(fresh, SECOND_REWARD_NAME).getByRole("button", { name: "Odebrana" })).toBeDisabled();
    await expect(redeemRow(fresh, SECOND_REWARD_NAME).getByText(/Magazyn: 4 szt\..*Już odebrana/)).toBeVisible();
    await stale.close();
  });
});
