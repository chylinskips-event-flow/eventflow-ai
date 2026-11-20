import { expect, test, type Page } from "@playwright/test";
import { admin, linksIn, state, waitForAppMail } from "../helpers";

// Uczestnik: rejestracja → mail z QR → wejście z linku → panel → usunięcie danych.

async function register(page: Page, slug: string, who: { first: string; last: string; email: string }) {
  await page.goto(`/e/${slug}/register`);
  await page.locator("#first_name").fill(who.first);
  await page.locator("#last_name").fill(who.last);
  await page.locator("#email").fill(who.email);
  await page.locator("#gdpr_consent").click();
  await page.getByRole("button", { name: "Zarejestruj się" }).click();
}

test("rejestracja bez zatwierdzania: mail z QR, wejście z linku, panel, usunięcie danych", async ({ page }) => {
  const { events } = state();
  const email = "ewa.uczestniczka@e2e.test";
  await register(page, events.open.slug, { first: "Ewa", last: "Uczestniczka", email });
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByText("Zarejestrowano!")).toBeVisible();

  const mail = await waitForAppMail(email, /Potwierdzenie rejestracji/);
  expect(mail.attachments.map((a) => a.filename)).toContain("kod-qr-wejscie.png");
  expect(mail.html).toContain("cid:qr-code");
  const accessLink = linksIn(mail.html).find((l) => l.includes("/a/"));
  expect(accessLink, "link do panelu w mailu").toBeTruthy();

  // Nowa przeglądarka (np. telefon na miejscu): wejście z linku z maila.
  const phone = await page.context().browser()!.newContext();
  const p2 = await phone.newPage();
  await p2.goto(accessLink!);
  await expect(p2.getByText(/Cześć, Ewa/)).toBeVisible();
  await expect(p2.getByAltText(/Kod QR/i).first()).toBeVisible();

  await p2.goto(`/e/${events.open.slug}/profile`);
  await p2.getByRole("button", { name: "Usuń moje dane" }).click();
  await p2.getByRole("button", { name: "Usuń trwale" }).click();
  await expect
    .poll(async () => (await admin().from("attendees").select("id").eq("email", email)).data?.length)
    .toBe(0);
  await phone.close();
});

test("ponowna rejestracja tym samym adresem: bez duplikatu, z linkiem do panelu", async ({ page }) => {
  const { events } = state();
  const email = "jan.duplikat@e2e.test";
  await register(page, events.open.slug, { first: "Jan", last: "Duplikat", email });
  await expect(page).toHaveURL(/\/welcome/);
  await register(page, events.open.slug, { first: "Jan", last: "Duplikat", email: "JAN.Duplikat@e2e.test" });
  await expect(page.getByText(/już zarejestrowany/i)).toBeVisible();
  const { data } = await admin().from("attendees").select("id").eq("event_id", events.open.id).ilike("email", email);
  expect(data).toHaveLength(1);
});

test("rejestracja z zatwierdzaniem: status oczekujący i mail o oczekiwaniu", async ({ page }) => {
  const { events } = state();
  const email = "olga.oczekujaca@e2e.test";
  await register(page, events.approval.slug, { first: "Olga", last: "Oczekująca", email });
  await expect(page.getByText("Zgłoszenie przyjęte!")).toBeVisible();
  await waitForAppMail(email, /oczekuje na zatwierdzenie/i);
  const { data } = await admin().from("attendees").select("status").eq("email", email).single();
  expect(data?.status).toBe("pending");
});

test("darmowy bilet: zapis, mail z QR", async ({ page }) => {
  const { events, freeTicketId } = state();
  const email = "tomasz.bilet@e2e.test";
  await page.goto(`/e/${events.tickets.slug}/checkout?ticket=${freeTicketId}`);
  await page.getByLabel(/Imi/).fill("Tomasz");
  await page.getByLabel(/Nazwisko/).fill("Biletowy");
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: /Zarejestruj/ }).click();
  await expect(page).toHaveURL(/checkout\/success/);
  await waitForAppMail(email, /Potwierdzenie rejestracji/);
  const { data } = await admin().from("tickets").select("id").eq("holder_email", email);
  expect(data).toHaveLength(1);
});
