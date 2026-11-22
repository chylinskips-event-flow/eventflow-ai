import { expect, test, type Browser, type Page } from "@playwright/test";
import { admin, latestAuthLink, loginWithMagicLink, state, waitForAppMail } from "../helpers";

// Panel partnera od początku do końca: organizator zaprasza osobę od partnera, partner loguje się
// z linku zaproszenia (Mailpit), wysyła zmiany wizytówki do akceptacji, organizator je publikuje,
// partner składa wniosek o stoisko, organizator unieważnia dostęp → ekran „dostęp cofnięty”.
// Plik jest niezależny od innych: własne wydarzenie, partner, katalog stoiska i logowanie.

test.describe.configure({ mode: "serial" });

const NO_SESSION = { storageState: { cookies: [], origins: [] } };
const ORGANIZER_STATE = "e2e/.organizer-10.json";
const PARTNER_STATE = "e2e/.partner-10.json";

// Sufiks przebiegu: plik da się uruchomić ponownie bez resetu bazy (unikalny slug i e-mail).
const RUN = Date.now().toString(36);
const PARTNER_NAME = `Partner Dziesiątka ${RUN}`;
const PARTNER_EMAIL = `kontakt.10.${RUN}@e2e.test`;
const OLD_DESCRIPTION = "Opis przed zmianą (E2E-10).";
const NEW_DESCRIPTION = `Nowy opis firmy z panelu partnera — E2E-10 ${RUN}.`;
const NEW_OFFER = `-15% dla uczestników z kodem E2E10-${RUN}.`;
const CATALOG_ITEM = "Stół wystawienniczy E2E-10";
const OTHER_NEEDS = "Dostęp do gniazdka 230 V przy stoisku.";

type Data = { eventId: string; slug: string; partnerId: string; catalogItemId: string; inviteUrl: string };
const data: Data = { eventId: "", slug: "", partnerId: "", catalogItemId: "", inviteUrl: "" };

async function createData() {
  const db = admin();
  const { events } = state();
  const { data: base, error: baseErr } = await db
    .from("events")
    .select("organization_id, timezone, starts_at, ends_at, location")
    .eq("id", events.open.id)
    .single();
  if (baseErr || !base) throw new Error(`wydarzenie bazowe: ${baseErr?.message}`);

  const { data: event, error: eventErr } = await db
    .from("events")
    .insert({
      ...base,
      slug: `e2e-partner-10-${RUN}`,
      name: `E2E Panel Partnera ${RUN}`,
      status: "published",
      requires_approval: false,
    })
    .select("id, slug")
    .single();
  if (eventErr || !event) throw new Error(`wydarzenie: ${eventErr?.message}`);

  const { data: partner, error: partnerErr } = await db
    .from("partners")
    .insert({ event_id: event.id, name: PARTNER_NAME, tier: "gold", description: OLD_DESCRIPTION })
    .select("id")
    .single();
  if (partnerErr || !partner) throw new Error(`partner: ${partnerErr?.message}`);

  // Własny katalog stoiska (bez domyślnego): catalog_seeded = true blokuje wstawienie domyślnych pozycji.
  const { error: settingsErr } = await db
    .from("booth_logistics_settings")
    .insert({ event_id: event.id, catalog_seeded: true });
  if (settingsErr) throw new Error(`ustawienia logistyki: ${settingsErr.message}`);
  const { data: item, error: itemErr } = await db
    .from("booth_catalog_items")
    .insert({ event_id: event.id, name: CATALOG_ITEM, unit: "szt.", sort_order: 0 })
    .select("id")
    .single();
  if (itemErr || !item) throw new Error(`katalog: ${itemErr?.message}`);

  data.eventId = event.id;
  data.slug = event.slug;
  data.partnerId = partner.id;
  data.catalogItemId = item.id;
}

const partnerAdminUrl = (tab: string) => `/admin/events/${data.eventId}/partners/${data.partnerId}?tab=${tab}`;
// Wszystkie zakładki szczegółów partnera są zamontowane (nieaktywne ukryte) — asercje w obrębie panelu.
const adminPanel = (page: Page, tab: string) => page.locator(`#partner-admin-tabpanel-${tab}`);

async function organizerPage(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ORGANIZER_STATE });
  return { ctx, page: await ctx.newPage() };
}

async function partnerPage(browser: Browser) {
  const ctx = await browser.newContext({ storageState: PARTNER_STATE });
  return { ctx, page: await ctx.newPage() };
}

test("organizator zaprasza osobę od partnera — mail z linkiem i status „Zaproszony”", async ({ page }) => {
  await createData();
  await loginWithMagicLink(page, "/login", state().organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });

  await page.goto(partnerAdminUrl("dostep"));
  await expect(page.getByRole("heading", { name: PARTNER_NAME })).toBeVisible();
  const panel = adminPanel(page, "dostep");
  await expect(panel.getByText("Nikt jeszcze nie ma dostępu.")).toBeVisible();
  await panel.locator("#invite-email").fill(PARTNER_EMAIL);
  await panel.getByRole("button", { name: "Zaproś" }).click();
  await expect(panel.getByText(`Zaproszenie wysłane na ${PARTNER_EMAIL}.`)).toBeVisible();

  const row = panel.locator("li", { hasText: PARTNER_EMAIL });
  await expect(row.getByText("Zaproszony", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Kopiuj link zaproszenia" })).toBeVisible();

  const mail = await waitForAppMail(PARTNER_EMAIL, /Zaproszenie do panelu partnera/);
  const invite = [...mail.html.matchAll(/href="([^"]*\/partner\/invite\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect(invite, "link zaproszenia w mailu").toBeTruthy();
  data.inviteUrl = invite;

  const { data: access } = await admin()
    .from("partner_access")
    .select("invite_token, user_id, revoked_at")
    .eq("partner_id", data.partnerId)
    .eq("email", PARTNER_EMAIL)
    .single();
  expect(access?.user_id).toBeNull();
  expect(access?.revoked_at).toBeNull();
  expect(invite).toContain(`/partner/invite/${access?.invite_token}`);
});

test("partner loguje się przyciskiem na stronie zaproszenia i linkiem z Mailpit", async ({ browser }) => {
  const ctx = await browser.newContext(NO_SESSION);
  const p = await ctx.newPage();
  await p.goto(data.inviteUrl);
  await expect(p.getByText("Zaproszenie do panelu partnera")).toBeVisible();
  await expect(p.getByText(PARTNER_NAME).first()).toBeVisible();

  const sent = new Date(Date.now() - 1000);
  await p.getByRole("button", { name: "Wyślij link logowania" }).click();
  await expect(p.getByText(/Link wysłany — sprawdź skrzynkę/)).toBeVisible();
  await p.goto(await latestAuthLink(PARTNER_EMAIL, sent));

  await expect(p).toHaveURL(new RegExp(`/partner/${data.partnerId}`));
  await expect(p.getByRole("heading", { level: 1, name: PARTNER_NAME })).toBeVisible();
  await expect(p.getByRole("tablist", { name: "Sekcje panelu partnera" })).toBeVisible();

  const { data: access } = await admin()
    .from("partner_access")
    .select("user_id, accepted_at")
    .eq("partner_id", data.partnerId)
    .eq("email", PARTNER_EMAIL)
    .single();
  expect(access?.user_id, "zaproszenie przypisane do konta").not.toBeNull();
  expect(access?.accepted_at).not.toBeNull();

  await ctx.storageState({ path: PARTNER_STATE });
  await ctx.close();
});

test("partner wysyła zmiany wizytówki do akceptacji — publicznie wciąż stara wersja", async ({ browser }) => {
  const { ctx, page: p } = await partnerPage(browser);
  await p.goto(`/partner/${data.partnerId}?tab=wizytowka`);
  await expect(p.getByRole("tab", { name: /Wizytówka/ })).toHaveAttribute("aria-selected", "true");
  await expect(p.getByText("Wizytówka jest aktualna.", { exact: false })).toBeVisible();
  await expect(p.locator("#p-description")).toHaveValue(OLD_DESCRIPTION);

  await p.locator("#p-description").fill(NEW_DESCRIPTION);
  await p.locator("#p-offer").fill(NEW_OFFER);
  await p.getByRole("button", { name: "Wyślij do akceptacji" }).click();
  await expect(p.getByText("Wysłano do akceptacji organizatora.")).toBeVisible();
  await expect(p.getByText("Zmiany czekają na akceptację organizatora.")).toBeVisible();

  // Po odświeżeniu formularz pokazuje szkic, a baner — oczekiwanie na organizatora.
  await p.reload();
  await expect(p.getByText("Zmiany czekają na akceptację organizatora.")).toBeVisible();
  await expect(p.locator("#p-description")).toHaveValue(NEW_DESCRIPTION);

  const { data: draft } = await admin()
    .from("partner_profile_drafts")
    .select("status, description, offer")
    .eq("partner_id", data.partnerId)
    .single();
  expect(draft).toMatchObject({ status: "pending", description: NEW_DESCRIPTION, offer: NEW_OFFER });
  const { data: partner } = await admin().from("partners").select("description").eq("id", data.partnerId).single();
  expect(partner?.description, "przed akceptacją partners bez zmian").toBe(OLD_DESCRIPTION);

  const visitor = await browser.newContext(NO_SESSION);
  const v = await visitor.newPage();
  await v.goto(`/e/${data.slug}/partners/${data.partnerId}`);
  await expect(v.getByText(OLD_DESCRIPTION)).toBeVisible();
  await expect(v.getByText(NEW_DESCRIPTION)).toHaveCount(0);
  await visitor.close();
  await ctx.close();
});

test("organizator akceptuje wizytówkę — strona publiczna partnera pokazuje nowy opis", async ({ browser }) => {
  const { ctx, page } = await organizerPage(browser);
  await page.goto(partnerAdminUrl("wizytowka"));
  const panel = adminPanel(page, "wizytowka");
  await expect(panel.getByText("Do akceptacji", { exact: true })).toBeVisible();
  await expect(panel.getByText("Proponowane").first()).toBeVisible();
  await expect(panel.getByText(NEW_DESCRIPTION)).toBeVisible();

  await panel.getByRole("button", { name: "Akceptuj i opublikuj" }).click();
  await expect(page.getByText("Zmiany opublikowane na stronie wydarzenia.")).toBeVisible();
  await expect(panel.getByText("Brak zmian do przejrzenia.")).toBeVisible();

  const { data: partner } = await admin().from("partners").select("description, offer").eq("id", data.partnerId).single();
  expect(partner).toMatchObject({ description: NEW_DESCRIPTION, offer: NEW_OFFER });
  const { data: draft } = await admin().from("partner_profile_drafts").select("partner_id").eq("partner_id", data.partnerId);
  expect(draft ?? [], "szkic usunięty po akceptacji").toHaveLength(0);

  const visitor = await browser.newContext(NO_SESSION);
  const v = await visitor.newPage();
  await v.goto(`/e/${data.slug}/partners/${data.partnerId}`);
  await expect(v.getByRole("heading", { level: 1, name: PARTNER_NAME })).toBeVisible();
  await expect(v.getByText(NEW_DESCRIPTION)).toBeVisible();
  await expect(v.getByText(NEW_OFFER)).toBeVisible();
  await expect(v.getByText(OLD_DESCRIPTION)).toHaveCount(0);
  await visitor.close();

  // Partner widzi, że wizytówka jest znowu aktualna.
  const partnerSide = await partnerPage(browser);
  await partnerSide.page.goto(`/partner/${data.partnerId}?tab=wizytowka`);
  await expect(partnerSide.page.getByText("Wizytówka jest aktualna.", { exact: false })).toBeVisible();
  await expect(partnerSide.page.locator("#p-description")).toHaveValue(NEW_DESCRIPTION);
  await partnerSide.ctx.close();
  await ctx.close();
});

test("partner składa wniosek o stoisko — organizator dostaje mail i widzi pozycje", async ({ browser }) => {
  const { ctx, page: p } = await partnerPage(browser);
  await p.goto(`/partner/${data.partnerId}?tab=stoisko`);
  await expect(p.getByText("Zapotrzebowanie na stoisko")).toBeVisible();
  await expect(p.getByText("Brak wniosku", { exact: true })).toBeVisible();

  await p.locator(`#qty_${data.catalogItemId}`).fill("2");
  await p.getByLabel(`Uwaga: ${CATALOG_ITEM}`).fill("Najlepiej przy wejściu.");
  await p.locator("#other_needs").fill(OTHER_NEEDS);
  await p.locator("#crew_count").fill("3");
  await p.getByRole("button", { name: "Wyślij do akceptacji" }).click();
  await expect(p.getByText("Wniosek wysłany do akceptacji organizatora.")).toBeVisible();
  await expect(p.getByText("Do akceptacji (2)", { exact: true })).toBeVisible();

  const db = admin();
  const { data: request } = await db
    .from("partner_booth_requests")
    .select("id, crew_count, event_id")
    .eq("partner_id", data.partnerId)
    .single();
  expect(request).toMatchObject({ crew_count: 3, event_id: data.eventId });
  const { data: items } = await db
    .from("partner_booth_request_items")
    .select("catalog_item_id, qty, note, status")
    .eq("request_id", request!.id);
  expect(items ?? []).toHaveLength(2);
  expect(items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ catalog_item_id: data.catalogItemId, qty: 2, note: "Najlepiej przy wejściu.", status: "pending" }),
      expect.objectContaining({ catalog_item_id: null, note: OTHER_NEEDS, status: "pending" }),
    ]),
  );

  const subject = new RegExp(`Zapotrzebowanie na stoisko do akceptacji — ${PARTNER_NAME}`);
  await waitForAppMail(state().organizerEmail, subject);
  await ctx.close();

  const org = await organizerPage(browser);
  await org.page.goto(partnerAdminUrl("stoisko"));
  const booth = adminPanel(org.page, "stoisko");
  await expect(booth.getByText("Partner nie złożył jeszcze wniosku.")).toHaveCount(0);
  await expect(booth.getByText(CATALOG_ITEM).first()).toBeVisible();
  await expect(booth.getByText(OTHER_NEEDS)).toBeVisible();
  await expect(booth.getByRole("button", { name: "Zatwierdź", exact: true }).first()).toBeVisible();
  await org.ctx.close();
});

test("organizator unieważnia dostęp — partner widzi ekran „dostęp cofnięty”", async ({ browser }) => {
  const { ctx, page } = await organizerPage(browser);
  await page.goto(partnerAdminUrl("dostep"));
  const panel = adminPanel(page, "dostep");
  const row = panel.locator("li", { hasText: PARTNER_EMAIL });
  await expect(row.getByText("Aktywny", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Unieważnij" }).click();
  await expect(panel.getByText("Unieważnione (1)")).toBeVisible();
  await expect(panel.getByText("Nikt jeszcze nie ma dostępu.")).toBeVisible();

  const { data: access } = await admin()
    .from("partner_access")
    .select("revoked_at")
    .eq("partner_id", data.partnerId)
    .eq("email", PARTNER_EMAIL)
    .single();
  expect(access?.revoked_at).not.toBeNull();
  await ctx.close();

  // Ta sama sesja partnera: panel odsyła na ekran „dostęp cofnięty”, bez treści panelu.
  const partnerSide = await partnerPage(browser);
  const p = partnerSide.page;
  await p.goto(`/partner/${data.partnerId}?tab=wizytowka`);
  await expect(p.getByText("Dostęp do panelu partnera został cofnięty")).toBeVisible();
  await expect(p.getByText(`Zalogowano jako ${PARTNER_EMAIL}.`)).toBeVisible();
  await expect(p.locator("#p-description")).toHaveCount(0);
  await expect(p).not.toHaveURL(new RegExp(`/partner/${data.partnerId}`));

  // Stary link zaproszenia z aktywną sesją też pokazuje ekran „dostęp cofnięty”.
  await p.goto(data.inviteUrl);
  await expect(p.getByText("Dostęp do panelu partnera został cofnięty")).toBeVisible();
  await partnerSide.ctx.close();
});
