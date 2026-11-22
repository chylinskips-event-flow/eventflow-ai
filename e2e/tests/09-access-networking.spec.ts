import { expect, test, type Browser, type Page } from "@playwright/test";
import { APP_URL } from "../env";
import { admin, appMails, linksIn, state, waitForAppMail } from "../helpers";

// Powracający uczestnik („Wejdź ponownie”) i networking: lista uczestników, prośba o kontakt
// z akceptacją, wymiana kontaktu kodem /connect/{contact_code}. Dane tworzone tutaj (admin()),
// adresy *.09@e2e.test — plik nie zależy od innych specyfikacji.

test.describe.configure({ mode: "serial" });

const NO_SESSION = { storageState: { cookies: [], origins: [] } };
const SENT_MESSAGE = "Jeśli ten adres jest zarejestrowany na to wydarzenie, wysłaliśmy na niego link.";

type Person = { id: string; email: string; first: string; last: string; qr_code_token: string; contact_code: string };

async function addAttendee(
  eventId: string,
  who: { first: string; last: string; email: string },
  extra: Record<string, unknown> = {},
): Promise<Person> {
  const { data, error } = await admin()
    .from("attendees")
    .insert({
      event_id: eventId,
      first_name: who.first,
      last_name: who.last,
      email: who.email,
      status: "approved",
      ...extra,
    })
    .select("id, email, qr_code_token, contact_code")
    .single();
  if (error) throw new Error(`[09] uczestnik ${who.email}: ${error.message}`);
  return { ...(data as Omit<Person, "first" | "last">), first: who.first, last: who.last };
}

/** Osobna, czysta przeglądarka z sesją uczestnika (wejście z osobistego linku). */
async function participantPage(browser: Browser, slug: string, person: Person): Promise<Page> {
  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  await page.goto(`/e/${slug}/a/${person.qr_code_token}`);
  await expect(page.getByText(new RegExp(`Cześć, ${person.first}`))).toBeVisible();
  return page;
}

function fullName(p: Person) {
  return `${p.first} ${p.last}`;
}

/** Karta uczestnika na liście /attendees (komponent Card z data-slot="card"). */
function attendeeCard(page: Page, p: Person) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByText(fullName(p), { exact: true }) });
}

async function requestLink(page: Page, slug: string, email: string) {
  await page.goto(`/e/${slug}/wejdz`);
  await expect(page.getByText("Wejdź ponownie").first()).toBeVisible();
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByRole("button", { name: "Wyślij link" }).click();
  const status = page.getByRole("status").filter({ hasText: "Sprawdź skrzynkę" });
  await expect(status).toBeVisible();
  return (await status.innerText()).trim();
}

test("„Wejdź ponownie”: mail z działającym linkiem do panelu", async ({ browser }) => {
  const { events } = state();
  const slug = events.open.slug;
  const wanda = await addAttendee(events.open.id, { first: "Wanda", last: "Powracająca", email: "wanda.09@e2e.test" });

  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  // Adres wpisany inną wielkością liter i ze spacjami — to nadal ten sam uczestnik.
  const message = await requestLink(page, slug, "  Wanda.09@E2E.test ");
  expect(message).toContain(SENT_MESSAGE);

  const mail = await waitForAppMail(wanda.email, /Twój link do wydarzenia/);
  expect(mail.subject).toContain(events.open.name);
  const panelLink = linksIn(mail.html).find((l) => l.includes(`/a/${wanda.qr_code_token}`));
  expect(panelLink, "link do panelu w mailu").toBeTruthy();
  expect(panelLink!.startsWith(`${APP_URL}/e/${slug}/a/`), `link wskazuje lokalną aplikację: ${panelLink}`).toBe(true);

  // Nowe urządzenie bez sesji: link z maila loguje do panelu.
  const phone = await browser.newContext(NO_SESSION);
  const p2 = await phone.newPage();
  await p2.goto(panelLink!);
  await expect(p2.getByText(/Cześć, Wanda/)).toBeVisible();

  // Zalogowany uczestnik wchodzący na /wejdz trafia od razu do panelu.
  await p2.goto(`/e/${slug}/wejdz`);
  await expect(p2.getByText(/Cześć, Wanda/)).toBeVisible();
  await expect(p2.getByLabel("Adres e-mail")).toHaveCount(0);

  await ctx.close();
  await phone.close();
});

test("„Wejdź ponownie”: nieznany adres i uczestnik oczekujący — ta sama odpowiedź, bez maila", async ({ browser }) => {
  const { events } = state();
  const slug = events.open.slug;
  const unknown = "nieznany.09@e2e.test";
  const pending = await addAttendee(
    events.open.id,
    { first: "Patryk", last: "Oczekujący", email: "patryk.09@e2e.test" },
    { status: "pending" },
  );
  const known = await addAttendee(events.open.id, { first: "Kamila", last: "Znana", email: "kamila.09@e2e.test" });

  const ctx = await browser.newContext(NO_SESSION);
  const page = await ctx.newPage();
  const unknownMessage = await requestLink(page, slug, unknown);
  const pendingMessage = await requestLink(page, slug, pending.email);
  const knownMessage = await requestLink(page, slug, known.email);

  // Brak enumeracji: identyczny komunikat niezależnie od tego, czy adres jest zarejestrowany.
  expect(unknownMessage).toContain(SENT_MESSAGE);
  expect(pendingMessage).toBe(unknownMessage);
  expect(knownMessage).toBe(unknownMessage);

  // Mail do znanego adresu dochodzi — wysyłki zlecone wcześniej (nieznany, oczekujący) już się wykonały.
  await waitForAppMail(known.email, /Twój link do wydarzenia/);
  await page.waitForTimeout(1_000);
  expect(await appMails(unknown), "mail na niezarejestrowany adres").toHaveLength(0);
  expect(await appMails(pending.email), "mail do niezatwierdzonego uczestnika").toHaveLength(0);
  await ctx.close();
});

test("lista uczestników: widoczne profile bez ukrytych i bez adresów e-mail", async ({ browser }) => {
  const { events } = state();
  const slug = events.open.slug;
  const viewer = await addAttendee(events.open.id, { first: "Lena", last: "Przeglądająca", email: "lena.09@e2e.test" });
  const visible = await addAttendee(
    events.open.id,
    { first: "Marek", last: "Widoczny", email: "marek.09@e2e.test" },
    { company: "Widoczna Sp. z o.o.", job_title: "CTO" },
  );
  const hidden = await addAttendee(
    events.open.id,
    { first: "Hanna", last: "Ukryta", email: "hanna.09@e2e.test" },
    { networking_visible: false },
  );
  const pendingOne = await addAttendee(
    events.open.id,
    { first: "Paweł", last: "Niezatwierdzony", email: "pawel.09@e2e.test" },
    { status: "pending" },
  );

  const page = await participantPage(browser, slug, viewer);
  await page.goto(`/e/${slug}/attendees`);
  await expect(page.getByRole("heading", { name: new RegExp(`Uczestnicy – ${events.open.name}`) })).toBeVisible();

  // Własna karta z oznaczeniem, widoczny uczestnik z rolą i przyciskiem kontaktu.
  await expect(attendeeCard(page, viewer).getByText("Mój profil")).toBeVisible();
  const visibleCard = attendeeCard(page, visible);
  await expect(visibleCard).toHaveCount(1);
  await expect(visibleCard.getByText("CTO · Widoczna Sp. z o.o.")).toBeVisible();
  await expect(visibleCard.getByRole("button", { name: "Poproś o kontakt" })).toBeVisible();

  // Ukryty (networking_visible=false) i niezatwierdzony — nieobecni.
  await expect(page.getByText(fullName(hidden))).toHaveCount(0);
  await expect(page.getByText(fullName(pendingOne))).toHaveCount(0);

  // Żadnych adresów e-mail — ani w treści, ani w danych strony (RSC).
  await expect(page.locator("main")).not.toContainText("@");
  const html = await page.content();
  for (const p of [visible, hidden, pendingOne]) {
    expect(html, `e-mail ${p.email} w HTML listy`).not.toContain(p.email);
  }
  expect(html).not.toContain(fullName(hidden));

  // Ukryta osoba widzi na liście siebie (zawsze), ale nie jest widoczna dla innych.
  const hiddenPage = await participantPage(browser, slug, hidden);
  await hiddenPage.goto(`/e/${slug}/attendees`);
  await expect(attendeeCard(hiddenPage, hidden).getByText("Mój profil")).toBeVisible();
  await expect(attendeeCard(hiddenPage, visible)).toHaveCount(1);

  await page.context().close();
  await hiddenPage.context().close();
});

test("prośba o kontakt A → B, akceptacja przez B, obie strony widzą e-mail", async ({ browser }) => {
  const { events } = state();
  const slug = events.open.slug;
  const a = await addAttendee(events.open.id, { first: "Adrian", last: "Proszący", email: "adrian.09@e2e.test" });
  const b = await addAttendee(events.open.id, { first: "Beata", last: "Przyjmująca", email: "beata.09@e2e.test" });

  const pageA = await participantPage(browser, slug, a);
  await pageA.goto(`/e/${slug}/attendees`);
  const cardB = attendeeCard(pageA, b);
  await cardB.getByRole("button", { name: "Poproś o kontakt" }).click();
  await expect(cardB.getByRole("button", { name: "Wysłano" })).toBeDisabled();

  await expect
    .poll(async () => {
      const { data } = await admin()
        .from("contact_requests")
        .select("status")
        .eq("requester_id", a.id)
        .eq("recipient_id", b.id);
      return data?.map((r) => r.status);
    })
    .toEqual(["pending"]);

  // Przed akceptacją A widzi wysłaną prośbę, ale bez e-maila B.
  await pageA.goto(`/e/${slug}/contacts`);
  await expect(pageA.getByRole("heading", { name: "Wysłane prośby" })).toBeVisible();
  await expect(pageA.getByText(fullName(b))).toBeVisible();
  await expect(pageA.getByText("Oczekuje na odpowiedź")).toBeVisible();
  await expect(pageA.getByText(b.email)).toHaveCount(0);
  expect(await pageA.content()).not.toContain(b.email);

  // B: na liście karta A ma „Odpowiedz”, na stronie kontaktów prośba bez e-maila A.
  const pageB = await participantPage(browser, slug, b);
  await pageB.goto(`/e/${slug}/attendees`);
  await expect(attendeeCard(pageB, a).getByRole("link", { name: "Odpowiedz" })).toBeVisible();
  await pageB.goto(`/e/${slug}/contacts`);
  await expect(pageB.getByRole("heading", { name: "Oczekują na Twoją odpowiedź" })).toBeVisible();
  const incoming = pageB.locator('[data-slot="card"]').filter({ hasText: fullName(a) });
  await expect(incoming).toHaveCount(1);
  expect(await pageB.content()).not.toContain(a.email);
  await incoming.getByRole("button", { name: "Akceptuj" }).click();

  await expect(pageB.getByRole("heading", { name: "Twoje kontakty" })).toBeVisible();
  await expect(pageB.getByRole("heading", { name: "Oczekują na Twoją odpowiedź" })).toHaveCount(0);
  await expect(pageB.getByRole("link", { name: a.email })).toHaveAttribute("href", `mailto:${a.email}`);

  const { data: row } = await admin()
    .from("contact_requests")
    .select("status, responded_at")
    .eq("requester_id", a.id)
    .eq("recipient_id", b.id)
    .single();
  expect(row?.status).toBe("accepted");
  expect(row?.responded_at).toBeTruthy();

  // A po odświeżeniu: B w „Twoich kontaktach” z e-mailem, na liście „Kontakt nawiązany”.
  await pageA.goto(`/e/${slug}/contacts`);
  await expect(pageA.getByRole("heading", { name: "Twoje kontakty" })).toBeVisible();
  await expect(pageA.getByRole("link", { name: b.email })).toHaveAttribute("href", `mailto:${b.email}`);
  await expect(pageA.getByRole("heading", { name: "Wysłane prośby" })).toHaveCount(0);
  await pageA.goto(`/e/${slug}/attendees`);
  await expect(attendeeCard(pageA, b).getByRole("link", { name: "Kontakt nawiązany" })).toBeVisible();

  // Wymiana kontaktów nie wysyła maili do uczestników.
  expect(await appMails(a.email)).toHaveLength(0);
  expect(await appMails(b.email)).toHaveLength(0);

  await pageA.context().close();
  await pageB.context().close();
});

test("kontakt kodem /connect/{contact_code}: od razu nawiązany, e-mail widoczny po obu stronach", async ({ browser }) => {
  const { events } = state();
  const slug = events.open.slug;
  const scanner = await addAttendee(events.open.id, { first: "Cezary", last: "Skanujący", email: "cezary.09@e2e.test" });
  const owner = await addAttendee(
    events.open.id,
    { first: "Dorota", last: "Kodowa", email: "dorota.09@e2e.test" },
    { company: "Kod S.A." },
  );

  const pageC = await participantPage(browser, slug, scanner);
  await pageC.goto(`/e/${slug}/connect/${owner.contact_code}`);
  await expect(pageC.getByRole("heading", { name: "Nawiąż kontakt" })).toBeVisible();
  await expect(pageC.getByText(fullName(owner))).toBeVisible();
  await expect(pageC.getByText("Kod S.A.")).toBeVisible();
  // E-mail ujawnia się dopiero po nawiązaniu kontaktu.
  expect(await pageC.content()).not.toContain(owner.email);

  await pageC.getByRole("button", { name: "Nawiąż kontakt" }).click();
  await expect(pageC).toHaveURL(new RegExp(`/e/${slug}/contacts$`));
  await expect(pageC.getByRole("heading", { name: "Twoje kontakty" })).toBeVisible();
  await expect(pageC.getByRole("link", { name: owner.email })).toHaveAttribute("href", `mailto:${owner.email}`);

  const { data: rows } = await admin()
    .from("contact_requests")
    .select("status, requester_id, recipient_id")
    .or(
      `and(requester_id.eq.${scanner.id},recipient_id.eq.${owner.id}),and(requester_id.eq.${owner.id},recipient_id.eq.${scanner.id})`,
    );
  expect(rows).toHaveLength(1);
  expect(rows![0]).toMatchObject({ status: "accepted", requester_id: scanner.id, recipient_id: owner.id });

  const pageD = await participantPage(browser, slug, owner);
  await pageD.goto(`/e/${slug}/contacts`);
  await expect(pageD.getByRole("heading", { name: "Twoje kontakty" })).toBeVisible();
  await expect(pageD.getByRole("link", { name: scanner.email })).toHaveAttribute("href", `mailto:${scanner.email}`);
  await expect(pageD.getByRole("heading", { name: "Oczekują na Twoją odpowiedź" })).toHaveCount(0);

  // Ponowne wejście w ten sam kod nie tworzy duplikatu.
  await pageC.goto(`/e/${slug}/connect/${owner.contact_code}`);
  await pageC.getByRole("button", { name: "Nawiąż kontakt" }).click();
  await expect(pageC).toHaveURL(new RegExp(`/e/${slug}/contacts$`));
  const { data: again } = await admin()
    .from("contact_requests")
    .select("id")
    .or(
      `and(requester_id.eq.${scanner.id},recipient_id.eq.${owner.id}),and(requester_id.eq.${owner.id},recipient_id.eq.${scanner.id})`,
    );
  expect(again).toHaveLength(1);

  await pageC.context().close();
  await pageD.context().close();
});

test("kod /connect: własny, nieprawidłowy, z innego wydarzenia i bez sesji — bez kontaktu", async ({ browser }) => {
  const { events } = state();
  const slug = events.open.slug;
  const me = await addAttendee(events.open.id, { first: "Ernest", last: "Własnokodowy", email: "ernest.09@e2e.test" });
  const target = await addAttendee(events.open.id, { first: "Fiona", last: "Docelowa", email: "fiona.09@e2e.test" });
  const elsewhere = await addAttendee(events.approval.id, { first: "Gerard", last: "Zinnego", email: "gerard.09@e2e.test" });

  // Bez sesji uczestnika: prośba o wejście przez link, bez danych właściciela kodu.
  const anonCtx = await browser.newContext(NO_SESSION);
  const anonPage = await anonCtx.newPage();
  await anonPage.goto(`/e/${slug}/connect/${target.contact_code}`);
  await expect(anonPage.getByText("Aby nawiązać kontakt, wejdź najpierw przez swój link wejściowy.")).toBeVisible();
  await expect(anonPage.getByText(fullName(target))).toHaveCount(0);
  await expect(anonPage.getByRole("button", { name: "Nawiąż kontakt" })).toHaveCount(0);
  await anonCtx.close();

  const page = await participantPage(browser, slug, me);
  await page.goto(`/e/${slug}/connect/${me.contact_code}`);
  await expect(page.getByText("To Twój kod.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nawiąż kontakt" })).toHaveCount(0);

  await page.goto(`/e/${slug}/connect/nie-ma-takiego-kodu-09`);
  await expect(page.getByText("Nieprawidłowy kod.")).toBeVisible();

  // Kod uczestnika innego wydarzenia nie działa na tym wydarzeniu.
  await page.goto(`/e/${slug}/connect/${elsewhere.contact_code}`);
  await expect(page.getByText("Nieprawidłowy kod.")).toBeVisible();
  await expect(page.getByText(fullName(elsewhere))).toHaveCount(0);

  const { data } = await admin()
    .from("contact_requests")
    .select("id")
    .or(`requester_id.eq.${me.id},recipient_id.eq.${me.id},requester_id.eq.${elsewhere.id},recipient_id.eq.${elsewhere.id}`);
  expect(data ?? []).toHaveLength(0);
  await page.context().close();
});
