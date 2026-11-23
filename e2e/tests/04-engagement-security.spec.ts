import { expect, test } from "@playwright/test";
import { admin, anon, state } from "../helpers";

// Pytania na sesji i bezpieczeństwo odczytu przez publiczny klucz anon.

test("uczestnik zadaje pytanie na sesji, organizator je widzi w bazie", async ({ page }) => {
  const { events, sessionId } = state();
  const { data: a } = await admin()
    .from("attendees")
    .insert({ event_id: events.open.id, first_name: "Iza", last_name: "Pytająca", email: "iza@e2e.test", status: "approved" })
    .select("qr_code_token")
    .single();
  await page.goto(`/e/${events.open.slug}/a/${a!.qr_code_token}`);
  await expect(page.getByText(/Cześć, Iza/)).toBeVisible();
  await page.goto(`/e/${events.open.slug}/agenda/${sessionId}`);
  await page.getByLabel("Treść pytania").fill("Kiedy będą slajdy z panelu?");
  await page.getByRole("button", { name: "Wyślij pytanie" }).click();
  await expect(page.getByText("Kiedy będą slajdy z panelu?")).toBeVisible();
  const { data } = await admin().from("questions").select("content").eq("session_id", sessionId);
  expect(data?.map((q) => q.content)).toContain("Kiedy będą slajdy z panelu?");
});

test("klucz anon nie odczytuje tokenów ani odpowiedzi quizów", async () => {
  const { events } = state();
  await admin().from("events").update({ reception_token: crypto.randomUUID() }).eq("id", events.open.id);
  const db = anon();
  const checks: [string, string][] = [
    ["events", "reception_token"],
    ["sessions", "qa_present_token"],
    ["partners", "qr_code_token"],
    ["quests", "config"],
  ];
  for (const [table, column] of checks) {
    const { data } = await db.from(table).select(column).not(column, "is", null);
    expect(data ?? [], `${table}.${column} widoczne dla anon`).toHaveLength(0);
  }
  const { data: attendees } = await db.from("attendees").select("email");
  expect(attendees ?? []).toHaveLength(0);
  await admin().from("events").update({ reception_token: null }).eq("id", events.open.id);
});
