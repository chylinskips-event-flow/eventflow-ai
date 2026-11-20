import { expect, test } from "@playwright/test";
import { admin, loginWithMagicLink, state, waitForAppMail } from "../helpers";

// Organizator: logowanie magic linkiem, zatwierdzanie uczestnika, recepcja, link obsługi.

async function addAttendee(eventId: string, first: string, status: "approved" | "pending") {
  const { data, error } = await admin()
    .from("attendees")
    .insert({ event_id: eventId, first_name: first, last_name: "Testowy", email: `${first.toLowerCase()}@e2e.test`, status })
    .select("id, qr_code_token, check_in_token")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

test.describe.configure({ mode: "serial" });

test("logowanie organizatora i lista wydarzeń", async ({ page }) => {
  const { organizerEmail, events } = state();
  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(events.open.name).first()).toBeVisible();
  await page.context().storageState({ path: "e2e/.organizer.json" });
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: "e2e/.organizer.json" });

  test("zatwierdzenie uczestnika wysyła mail z QR", async ({ page }) => {
    const { events } = state();
    await addAttendee(events.approval.id, "Zenon", "pending");
    await page.goto(`/admin/events/${events.approval.id}/attendees?tab=pending`);
    await page.getByRole("button", { name: "Zatwierdź" }).first().click();
    await waitForAppMail("zenon@e2e.test", /Potwierdzenie rejestracji/);
    const { data } = await admin().from("attendees").select("status").eq("email", "zenon@e2e.test").single();
    expect(data?.status).toBe("approved");
  });

  test("recepcja: zameldowanie z listy i cofnięcie", async ({ page }) => {
    const { events } = state();
    await addAttendee(events.open.id, "Marek", "approved");
    await page.goto(`/admin/events/${events.open.id}/reception`);
    const row = page.locator("div.rounded-lg.border", { hasText: "Marek Testowy" });
    await row.getByRole("button", { name: "Zamelduj" }).click();
    await expect(row.getByRole("button", { name: "Cofnij zameldowanie" })).toBeVisible();
    const after = await admin().from("attendees").select("checked_in_at").eq("email", "marek@e2e.test").single();
    expect(after.data?.checked_in_at).not.toBeNull();
    await row.getByRole("button", { name: "Cofnij zameldowanie" }).click();
    await expect(row.getByRole("button", { name: "Zamelduj" })).toBeVisible();
  });

  test("link obsługi recepcji działa bez logowania", async ({ page, browser }) => {
    const { events } = state();
    await addAttendee(events.open.id, "Kasia", "approved");
    const token = crypto.randomUUID();
    await admin().from("events").update({ reception_token: token }).eq("id", events.open.id);
    const staff = await browser.newContext();
    const s = await staff.newPage();
    await s.goto(`/e/${events.open.slug}/recepcja/${token}`);
    const row = s.locator("div.rounded-lg.border", { hasText: "Kasia Testowy" });
    await row.getByRole("button", { name: "Zamelduj" }).click();
    await expect(row.getByRole("button", { name: "Cofnij zameldowanie" })).toBeVisible();
    await admin().from("events").update({ reception_token: null }).eq("id", events.open.id);
    await s.reload();
    await expect(s.getByText("Link nieaktywny")).toBeVisible();
    await staff.close();
    void page;
  });

  test("zaproszenie partnera: mail z linkiem i panel partnera", async ({ page, browser }) => {
    const { events, partnerId, partnerEmail } = state();
    await page.goto(`/admin/events/${events.open.id}/partners/${partnerId}`);
    await page.locator("#invite-email").fill(partnerEmail);
    await page.getByRole("button", { name: "Zaproś" }).click();
    const mail = await waitForAppMail(partnerEmail, /.*/);
    const invite = [...mail.html.matchAll(/href="([^"]+partner\/invite\/[^"]+)"/g)].map((m) => m[1])[0];
    expect(invite, "link zaproszenia w mailu").toBeTruthy();

    const partnerCtx = await browser.newContext();
    const p = await partnerCtx.newPage();
    await p.goto(invite.replace(/&amp;/g, "&"));
    const { latestAuthLink } = await import("../helpers");
    const sent = new Date(Date.now() - 1000);
    await p.getByRole("button", { name: /zaloguj|wyślij|link/i }).first().click();
    await p.goto(await latestAuthLink(partnerEmail, sent));
    await expect(p).toHaveURL(/\/partner/);
    await expect(p.getByText("Partner E2E").first()).toBeVisible();
    await partnerCtx.close();
  });
});
