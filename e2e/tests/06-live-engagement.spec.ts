import { expect, test, type Browser } from "@playwright/test";
import { admin, loginWithMagicLink, state } from "../helpers";

// Zaangażowanie na żywo (poza samym zadaniem pytania): ankiety, oceny sesji,
// panel prowadzącego (/mod/{token}) i ekran rzutnika (/qa/{token}).
// Plik jest niezależny od innych: ma własne wydarzenie, sesje i uczestników.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-06.json";
// Uczestnicy, prowadzący i rzutnik otwierają linki w czystej przeglądarce, bez sesji organizatora.
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const EVENT_SLUG = "e2e-06-live";
const EVENT_NAME = "E2E Zaangażowanie na żywo";

const minutesFromNow = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

/** Własne opublikowane wydarzenie w organizacji organizatora E2E (tworzone raz). */
async function liveEvent(): Promise<{ id: string; slug: string; name: string }> {
  const db = admin();
  const { data: existing } = await db.from("events").select("id, slug, name").eq("slug", EVENT_SLUG).maybeSingle();
  if (existing) return existing;
  const { data: open, error: openErr } = await db
    .from("events")
    .select("organization_id")
    .eq("id", state().events.open.id)
    .single();
  if (openErr || !open) throw new Error(`[06] wydarzenie bazowe: ${openErr?.message}`);
  const { data, error } = await db
    .from("events")
    .insert({
      organization_id: open.organization_id,
      slug: EVENT_SLUG,
      name: EVENT_NAME,
      status: "published",
      requires_approval: false,
      timezone: "Europe/Warsaw",
      starts_at: minutesFromNow(-120),
      ends_at: minutesFromNow(24 * 60),
      location: "Łódź, Sala Testowa",
      room_names: ["Sala A", "Sala B"],
    })
    .select("id, slug, name")
    .single();
  if (error || !data) throw new Error(`[06] wydarzenie: ${error?.message}`);
  return data;
}

async function addSession(eventId: string, title: string, startInMin: number, durationMin = 60) {
  const { data, error } = await admin()
    .from("sessions")
    .insert({
      event_id: eventId,
      title,
      room: "Sala A",
      starts_at: minutesFromNow(startInMin),
      ends_at: minutesFromNow(startInMin + durationMin),
    })
    .select("id, qa_present_token")
    .single();
  if (error || !data) throw new Error(`[06] sesja ${title}: ${error?.message}`);
  return data as { id: string; qa_present_token: string };
}

async function addAttendee(eventId: string, first: string, email: string) {
  const { data, error } = await admin()
    .from("attendees")
    .insert({ event_id: eventId, first_name: first, last_name: "Szóstka", email, status: "approved" })
    .select("id, qr_code_token")
    .single();
  if (error || !data) throw new Error(`[06] uczestnik ${email}: ${error?.message}`);
  return data as { id: string; qr_code_token: string };
}

async function addQuestion(sessionId: string, attendeeId: string, content: string, status = "pending") {
  const { data, error } = await admin()
    .from("questions")
    .insert({ session_id: sessionId, attendee_id: attendeeId, content, status })
    .select("id")
    .single();
  if (error || !data) throw new Error(`[06] pytanie: ${error?.message}`);
  return data.id as string;
}

/** Uczestnik wchodzi z linku z maila (/e/{slug}/a/{token}) w świeżej przeglądarce. */
async function participantPage(browser: Browser, slug: string, qrToken: string, first: string) {
  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  await page.goto(`/e/${slug}/a/${qrToken}`);
  await expect(page.getByText(new RegExp(`Cześć, ${first}`))).toBeVisible();
  return { ctx, page };
}

test("logowanie organizatora (sesja dla testów zaangażowania)", async ({ page }) => {
  await liveEvent();
  await loginWithMagicLink(page, "/login", state().organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("ankieta: organizator tworzy i otwiera, uczestnik odpowiada, po zamknięciu znika", async ({ page, browser }) => {
    const event = await liveEvent();
    const session = await addSession(event.id, "Sesja z ankietą 06", 24 * 60);
    const question = "Z jakiego narzędzia korzystasz najczęściej? (06)";

    // Organizator: zakładka „Ankiety” szczegółów sesji.
    await page.goto(`/admin/events/${event.id}/engagement/${session.id}?tab=ankiety`);
    await page.locator("#poll-question").fill(question);
    await page.getByRole("textbox", { name: "Odpowiedź 1" }).fill("Arkusz kalkulacyjny");
    await page.getByRole("textbox", { name: "Odpowiedź 2" }).fill("Notatnik");
    await page.getByRole("button", { name: "Utwórz ankietę" }).click();
    await expect(page.getByText("Ankieta utworzona. Otwórz ją, gdy będzie gotowa.")).toBeVisible();

    const pollItem = page.locator("li", { hasText: question }).filter({ has: page.getByRole("button", { name: "Usuń ankietę" }) });
    await expect(pollItem.getByText("Szkic")).toBeVisible();
    const { data: draft } = await admin().from("polls").select("id, status, options").eq("session_id", session.id).single();
    expect(draft?.status).toBe("draft");
    // Szkic nie jest widoczny dla uczestników.
    const attendee = await addAttendee(event.id, "Ala", "ala.ankieta.06@e2e.test");
    const { ctx, page: p } = await participantPage(browser, event.slug, attendee.qr_code_token, "Ala");
    await p.goto(`/e/${event.slug}/agenda/${session.id}`);
    await expect(p.getByText("Pytania do prelegenta")).toBeVisible();
    await expect(p.getByText(question)).toHaveCount(0);

    await pollItem.getByRole("button", { name: "Otwórz", exact: true }).click();
    await expect(pollItem.getByText("Otwarta")).toBeVisible();
    await expect(pollItem.getByRole("button", { name: "Zamknij" })).toBeVisible();
    await expect
      .poll(async () => (await admin().from("polls").select("status").eq("id", draft!.id).single()).data?.status)
      .toBe("open");

    // Uczestnik: ankieta na stronie sesji, wyniki dopiero po oddaniu głosu.
    await p.reload();
    await expect(p.getByText(question)).toBeVisible();
    await expect(p.getByText("Wybierz odpowiedź, aby zobaczyć wyniki.")).toBeVisible();
    const choice = p.getByRole("button", { name: /Notatnik/ });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(p.getByText(/1 głos · możesz zmienić odpowiedź/)).toBeVisible();
    await expect(choice).toContainText("100%");

    const notatnikId = (draft!.options as { id: string; label: string }[]).find((o) => o.label === "Notatnik")!.id;
    const { data: answers } = await admin().from("poll_answers").select("selected_option_id").eq("poll_id", draft!.id);
    expect(answers).toEqual([{ selected_option_id: notatnikId }]);

    // Zmiana zdania, dopóki ankieta jest otwarta — dalej jeden głos.
    const other = p.getByRole("button", { name: /Arkusz kalkulacyjny/ });
    await other.click();
    await expect(other).toHaveAttribute("aria-pressed", "true");
    await expect(choice).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => (await admin().from("poll_answers").select("selected_option_id").eq("poll_id", draft!.id)).data?.length)
      .toBe(1);

    // Organizator widzi wynik i zamyka ankietę.
    await page.reload();
    await expect(pollItem.getByText("1 głosów")).toBeVisible();
    await expect(pollItem.getByText("1 · 100%")).toBeVisible();
    await pollItem.getByRole("button", { name: "Zamknij" }).click();
    await expect(pollItem.getByText("Zamknięta")).toBeVisible();
    await expect(pollItem.getByRole("button", { name: "Otwórz ponownie" })).toBeVisible();

    // Zamknięta ankieta znika ze strony sesji uczestnika.
    await p.reload();
    await expect(p.getByText("Pytania do prelegenta")).toBeVisible();
    await expect(p.getByText(question)).toHaveCount(0);
    await ctx.close();
  });

  test("ocena sesji: dostępna po rozpoczęciu, niedostępna przed; organizator widzi wynik", async ({ page, browser }) => {
    const event = await liveEvent();
    const future = await addSession(event.id, "Sesja przyszła 06", 2 * 24 * 60);
    const ongoing = await addSession(event.id, "Sesja trwająca 06", -30, 90);
    const attendee = await addAttendee(event.id, "Ola", "ola.ocena.06@e2e.test");
    const { ctx, page: p } = await participantPage(browser, event.slug, attendee.qr_code_token, "Ola");

    // Sesja jeszcze się nie zaczęła — brak karty oceny.
    await p.goto(`/e/${event.slug}/agenda/${future.id}`);
    await expect(p.getByText("Pytania do prelegenta")).toBeVisible();
    await expect(p.getByText("Oceń sesję")).toHaveCount(0);
    await expect(p.getByRole("radiogroup", { name: "Ocena od 1 do 5" })).toHaveCount(0);

    // Sesja trwa — można ocenić.
    await p.goto(`/e/${event.slug}/agenda/${ongoing.id}`);
    await expect(p.getByText("Oceń sesję")).toBeVisible();
    const submit = p.getByRole("button", { name: "Wyślij ocenę" });
    await expect(submit).toBeDisabled();
    await p.getByRole("radio", { name: "4 na 5" }).click();
    await expect(p.getByRole("radio", { name: "4 na 5" })).toHaveAttribute("aria-checked", "true");
    await p.getByLabel("Komentarz do oceny").fill("Konkretnie i na temat (06).");
    await submit.click();
    await expect(p.getByText("Dziękujemy za ocenę!")).toBeVisible();

    await expect
      .poll(async () => (await admin().from("feedback").select("rating, comment").eq("session_id", ongoing.id)).data)
      .toEqual([{ rating: 4, comment: "Konkretnie i na temat (06)." }]);
    // Przed rozpoczęciem nic się nie zapisało.
    const { data: none } = await admin().from("feedback").select("rating").eq("session_id", future.id);
    expect(none).toHaveLength(0);

    // Po odświeżeniu ocena jest zapamiętana i można ją zmienić (bez duplikatu).
    await p.reload();
    await expect(p.getByText("Dziękujemy! Możesz zmienić swoją ocenę.")).toBeVisible();
    await expect(p.getByRole("radio", { name: "4 na 5" })).toHaveAttribute("aria-checked", "true");
    await p.getByRole("radio", { name: "5 na 5" }).click();
    await p.getByRole("button", { name: "Zaktualizuj ocenę" }).click();
    await expect(p.getByText("Dziękujemy za ocenę!")).toBeVisible();
    await expect
      .poll(async () => (await admin().from("feedback").select("rating").eq("session_id", ongoing.id)).data)
      .toEqual([{ rating: 5 }]);
    await ctx.close();

    // Organizator: zakładka „Oceny sesji”.
    await page.goto(`/admin/events/${event.id}/engagement/${ongoing.id}?tab=oceny`);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("5.0", { exact: true })).toBeVisible();
    await expect(panel.getByText("1 ocen")).toBeVisible();
    await expect(panel.getByText("Konkretnie i na temat (06).")).toBeVisible();
  });

  test("link prowadzącego: organizator tworzy, /mod/{token} pokazuje pytanie i oznacza je", async ({ page, browser }) => {
    const event = await liveEvent();
    const session = await addSession(event.id, "Sesja moderatora 06", -10, 60);
    const author = await addAttendee(event.id, "Mira", "mira.pytanie.06@e2e.test");
    const toDiscuss = "Jak mierzycie efekty wdrożenia? (06)";
    const toAnswer = "Czy będzie nagranie z sesji? (06)";
    const discussId = await addQuestion(session.id, author.id, toDiscuss);
    const answerId = await addQuestion(session.id, author.id, toAnswer);

    // Organizator tworzy link w zakładce „Linki dla prowadzących”.
    const label = "Prowadzący 06";
    await page.goto(`/admin/events/${event.id}/moderator?tab=linki`);
    await page.locator("#link-label").fill(label);
    await page.getByRole("button", { name: "Utwórz link" }).click();
    await expect(page.getByText("Link utworzony.")).toBeVisible();
    const linkRow = page.locator("li", { hasText: label });
    await expect(linkRow.getByText("Wszystkie sale")).toBeVisible();

    const { data: link } = await admin()
      .from("moderator_links")
      .select("token, room, revoked_at")
      .eq("event_id", event.id)
      .eq("label", label)
      .single();
    expect(link?.room).toBeNull();
    expect(link?.revoked_at).toBeNull();
    const shownUrl = (await linkRow.locator("code").innerText()).trim();
    expect(new URL(shownUrl).pathname).toBe(`/mod/${link!.token}`);

    // Prowadzący otwiera link bez logowania.
    const staff = await browser.newContext(NO_SESSION);
    const m = await staff.newPage();
    await m.goto(`/mod/${link!.token}?s=${session.id}`);
    await expect(m.getByText(`Panel prowadzącego · ${label}`)).toBeVisible();
    await expect(m.getByRole("heading", { name: "Sesja moderatora 06" })).toBeVisible();
    await expect(m.getByText("Pytania (2)")).toBeVisible();

    const discussRow = m.locator("li", { hasText: toDiscuss });
    const answerRow = m.locator("li", { hasText: toAnswer });
    await expect(discussRow).toBeVisible();
    await expect(answerRow).toBeVisible();

    // „Teraz omawiane”.
    await discussRow.getByRole("button", { name: "Teraz omawiane" }).click();
    await expect(discussRow.getByRole("button", { name: "Teraz omawiane" })).toHaveCount(0);
    await expect(discussRow.getByText("Teraz omawiane")).toBeVisible();
    await expect
      .poll(async () => (await admin().from("questions").select("status").eq("id", discussId).single()).data?.status)
      .toBe("selected");

    // „Odpowiedziane”.
    await answerRow.getByRole("button", { name: "Odpowiedziane" }).click();
    await expect(answerRow.getByRole("button", { name: "Przywróć" })).toBeVisible();
    await expect(answerRow.getByText("Odpowiedziane")).toBeVisible();
    await expect
      .poll(async () => (await admin().from("questions").select("status").eq("id", answerId).single()).data?.status)
      .toBe("answered");
    // Wyróżnienie drugiego pytania nie zmieniło się.
    const { data: stillSelected } = await admin().from("questions").select("status").eq("id", discussId).single();
    expect(stillSelected?.status).toBe("selected");

    // Unieważnienie linku odcina dostęp.
    page.once("dialog", (d) => d.accept());
    await linkRow.getByRole("button", { name: "Unieważnij" }).click();
    await expect(page.getByText(/Unieważnione \(1\)/)).toBeVisible();
    const res = await m.goto(`/mod/${link!.token}?s=${session.id}`);
    expect(res?.status()).toBe(404);
    await expect(m.getByText(`Panel prowadzącego · ${label}`)).toHaveCount(0);
    await staff.close();
  });

  test("rzutnik /qa/{token}: pokazuje pytania i otwartą ankietę, nigdy ukrytych pytań", async ({ page, browser }) => {
    const event = await liveEvent();
    const session = await addSession(event.id, "Sesja rzutnika 06", -15, 60);
    const author = await addAttendee(event.id, "Rita", "rita.rzutnik.06@e2e.test");
    const visible = "Pytanie widoczne na rzutniku (06)";
    const selected = "Pytanie właśnie omawiane (06)";
    const hidden = "Pytanie ukryte od początku (06)";
    const toHide = "Pytanie do ukrycia przez organizatora (06)";
    await addQuestion(session.id, author.id, visible);
    await addQuestion(session.id, author.id, selected, "selected");
    await addQuestion(session.id, author.id, hidden, "hidden");
    const toHideId = await addQuestion(session.id, author.id, toHide);
    const pollQuestion = "Czy rzutnik działa? (06)";
    await admin()
      .from("polls")
      .insert({
        event_id: event.id,
        session_id: session.id,
        question: pollQuestion,
        status: "open",
        options: [
          { id: "tak", label: "Tak" },
          { id: "nie", label: "Nie" },
        ],
      })
      .throwOnError();

    // Rzutnik w czystej przeglądarce (publiczny, tylko odczyt).
    const screen = await browser.newContext(NO_SESSION);
    const s = await screen.newPage();
    await s.goto(`/qa/${session.qa_present_token}`);
    await expect(s.getByRole("heading", { name: "Sesja rzutnika 06" })).toBeVisible();
    await expect(s.getByText(visible)).toBeVisible();
    await expect(s.getByText(toHide)).toBeVisible();
    await expect(s.getByText("Teraz omawiane")).toBeVisible();
    await expect(s.getByText(selected)).toBeVisible();
    await expect(s.getByText(pollQuestion)).toBeVisible();
    await expect(s.getByText(hidden)).toHaveCount(0);
    expect(await s.content()).not.toContain(hidden);

    // Organizator ukrywa pytanie — rzutnik przestaje je pokazywać (odświeża się sam).
    await page.goto(`/admin/events/${event.id}/engagement/${session.id}?tab=pytania`);
    const row = page.locator("li", { hasText: toHide });
    await row.getByRole("button", { name: "Ukryj pytanie" }).click();
    await expect(row.getByRole("button", { name: "Pokaż" })).toBeVisible();
    await expect
      .poll(async () => (await admin().from("questions").select("status").eq("id", toHideId).single()).data?.status)
      .toBe("hidden");

    await expect(s.getByText(toHide)).toHaveCount(0, { timeout: 20_000 });
    await s.reload();
    await expect(s.getByText(visible)).toBeVisible();
    await expect(s.getByText(toHide)).toHaveCount(0);
    await expect(s.getByText(hidden)).toHaveCount(0);
    const html = await s.content();
    expect(html).not.toContain(toHide);
    expect(html).not.toContain(hidden);

    // Nieznany token rzutnika → 404.
    const res = await s.goto(`/qa/${crypto.randomUUID()}`);
    expect(res?.status()).toBe(404);
    await screen.close();
  });
});
