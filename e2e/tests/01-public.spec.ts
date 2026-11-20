import { expect, test } from "@playwright/test";
import { state } from "../helpers";

// Strona publiczna wydarzenia: treść, szkic niewidoczny, brak tokenów w HTML.

test("strona wydarzenia pokazuje agendę, prelegentów i partnera", async ({ page }) => {
  const { events } = state();
  await page.goto(`/e/${events.open.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: events.open.name })).toBeVisible();
  await expect(page.getByText("Panel o przyszłości miast")).toBeVisible();
  await expect(page.getByText("Anna Prelegentka").first()).toBeVisible();
  await expect(page.getByText("Partner E2E").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Zarejestruj się/ }).first()).toBeVisible();
});

test("kod strony nie zawiera tokenów linków obsługi", async ({ request }) => {
  const { events } = state();
  const html = await (await request.get(`/e/${events.open.slug}`)).text();
  for (const name of ["reception_token", "qa_present_token", "qr_code_token", "check_in_token"]) {
    expect(html, name).not.toContain(name);
  }
});

test("szkic nie jest widoczny publicznie", async ({ page }) => {
  const { events } = state();
  await page.goto(`/e/${events.draft.slug}`);
  await expect(page.getByText(events.draft.name)).toHaveCount(0);
});

test("nieistniejące wydarzenie: komunikat, bez błędu serwera", async ({ page }) => {
  const res = await page.goto("/e/nie-ma-takiego-e2e");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.getByText(/nie zostało znalezione|nie znaleziono/i)).toBeVisible();
});

test("wydarzenie z biletami: lista biletów, darmowa rejestracja zamknięta", async ({ page }) => {
  const { events } = state();
  await page.goto(`/e/${events.tickets.slug}`);
  await expect(page.getByText("Wejściówka darmowa")).toBeVisible();
  await expect(page.getByText("Bilet VIP")).toBeVisible();
  await page.goto(`/e/${events.tickets.slug}/register`);
  // Oczekiwane po PR #21: formularz darmowej rejestracji niedostępny, gdy wydarzenie ma bilety.
  await expect(page.locator("input[name=email]")).toHaveCount(0);
});
