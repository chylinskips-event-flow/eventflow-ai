import { expect, request, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { APP_URL } from "../env";
import { admin, loginWithMagicLink, state } from "../helpers";

// Galeria — część 2: widok uczestnika /e/{slug}/zdjecia, podgląd (następne/poprzednie/zamknij),
// „To ja” + filtr „Moje zdjęcia”, pobieranie, zgłoszenia zdjęć i decyzje organizatora
// („Zostaw” / „Usuń”), ukrywanie, warunki dostępu (check-in, publikacja, włączenie galerii,
// osoba anonimowa, uczestnik oczekujący, uczestnik innego wydarzenia) oraz próby operacji
// na cudzych / ukrytych zdjęciach (podmiana identyfikatora w żądaniu akcji serwera).
// Plik jest niezależny od innych: sam loguje organizatora i tworzy własne dane.
// Treści zgłoszeń nie są wypisywane (porównania tylko jako wartości logiczne).

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-15.json";
const NO_SESSION = { storageState: { cookies: [], origins: [] } };
const RUN = Date.now().toString(36);
const PHOTOGRAPHER = `Fotograf E2E 15 ${RUN}`;
const REPORT_TEXT = `Prośba testowa E2E 15 ${RUN}`;
const ATTENDEE_COOKIE = "eventflow_attendee_token";
const UPLOADED = 4;

type Person = { id: string; first: string; qr_code_token: string };
type Ev = { id: string; slug: string; name: string };
type Ctx = {
  event: Ev;
  other: Ev;
  ola: Person; // zatwierdzona, z check-inem
  zofia: Person; // zatwierdzona, z check-inem (druga osoba — widok innych uczestników)
  piotr: Person; // zatwierdzony, bez check-inu
  pawel: Person; // oczekujący (pending), z check-inem
  bartek: Person; // uczestnik innego wydarzenia
  uploadedIds: string[]; // zdjęcia od fotografa, od najnowszych (kolejność w siatce)
  hiddenId: string;
  uploadingId: string;
  failedId: string;
  foreignId: string; // gotowe zdjęcie innego wydarzenia
};
const ctx: Partial<Ctx> = {};
const need = <K extends keyof Ctx>(key: K): Ctx[K] => {
  const v = ctx[key];
  if (v === undefined) throw new Error(`Brak ${key} — wcześniejszy test w pliku 15 nie przeszedł.`);
  return v as Ctx[K];
};

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function insertEvent(orgId: string, slug: string, name: string): Promise<Ev> {
  const { data, error } = await admin()
    .from("events")
    .insert({
      organization_id: orgId,
      slug,
      name,
      timezone: "Europe/Warsaw",
      starts_at: at(7, 8),
      ends_at: at(7, 16),
      location: "Poznań, MTP",
      status: "published",
      requires_approval: false,
    })
    .select("id, slug, name")
    .single();
  if (error) throw new Error(`[15] wydarzenie ${slug}: ${error.message}`);
  return data as Ev;
}

async function addAttendee(eventId: string, first: string, opts: { status?: "approved" | "pending"; checkedIn: boolean }): Promise<Person> {
  const { data, error } = await admin()
    .from("attendees")
    .insert({
      event_id: eventId,
      first_name: first,
      last_name: "Piętnasty",
      email: `${first.toLowerCase()}.${RUN}.15@e2e.test`,
      company: "Firma 15",
      status: opts.status ?? "approved",
      checked_in_at: opts.checkedIn ? new Date().toISOString() : null,
    })
    .select("id, qr_code_token")
    .single();
  if (error) throw new Error(`[15] uczestnik ${first}: ${error.message}`);
  return { ...(data as { id: string; qr_code_token: string }), first };
}

/** Mały, poprawny JPEG o losowym kolorze (inny skrót SHA-256 przy każdym wywołaniu). */
async function makeJpeg(w = 640, h = 480): Promise<Buffer> {
  const rnd = () => Math.floor(Math.random() * 256);
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: rnd(), g: rnd(), b: rnd() } } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Wiersz zdjęcia wstawiony bezpośrednio (z plikami w LOKALNYM Storage), np. ukryte / w trakcie / innego eventu. */
async function insertPhoto(eventId: string, opts: { status: "ready" | "uploading" | "failed"; hidden?: boolean }): Promise<string> {
  const id = crypto.randomUUID();
  const display = `${eventId}/${id}/display.jpg`;
  const thumb = `${eventId}/${id}/thumb.jpg`;
  const bucket = admin().storage.from("event-photos");
  for (const p of [display, thumb]) {
    const { error } = await bucket.upload(p, await makeJpeg(320, 240), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`[15] storage ${p}: ${error.message}`);
  }
  const { error } = await admin()
    .from("event_photos")
    .insert({
      id,
      event_id: eventId,
      status: opts.status,
      display_path: display,
      thumb_path: thumb,
      width: 320,
      height: 240,
      original_bytes: 1000,
      size_bytes: 2000,
      content_hash: crypto.randomBytes(32).toString("hex"),
      hidden: opts.hidden ?? false,
      processed_at: opts.status === "ready" ? new Date().toISOString() : null,
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
  if (error) throw new Error(`[15] zdjęcie: ${error.message}`);
  return id;
}

/** Uczestnik w czystej przeglądarce — sesja z osobistego linku /e/{slug}/a/{token}. */
async function participant(browser: Browser, slug: string, person: Person, opts: { mobile?: boolean } = {}) {
  const context = await browser.newContext({
    ...NO_SESSION,
    ...(opts.mobile ? { viewport: { width: 390, height: 844 } } : {}),
  });
  const page = await context.newPage();
  await expect(async () => {
    await page.goto(`/e/${slug}/a/${person.qr_code_token}`);
    await expect(page.getByText(new RegExp(`Cześć, ${person.first}`))).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  return { context, page };
}

async function openGallery(page: Page, slug: string) {
  await page.goto(`/e/${slug}/zdjecia`);
  await expect(page.getByRole("heading", { name: /^Zdjęcia – / })).toBeVisible();
}

function filterButton(page: Page, name: "Wszystkie" | "Moje zdjęcia") {
  return page.getByRole("radio", { name: new RegExp(`^${name} \\(`) });
}

const viewer = (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Zamknij podgląd" }) });

/** Identyfikator zdjęcia z podpisanego adresu obrazu w podglądzie ({eventId}/{photoId}/display.jpg). */
async function viewedPhotoId(page: Page): Promise<string> {
  const img = viewer(page).locator("img");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: "zdjęcie w podglądzie się wczytało" }).toBe(true);
  const src = (await img.getAttribute("src")) ?? "";
  const m = /\/([0-9a-f-]{36})\/display\.jpg/.exec(src);
  if (!m) throw new Error("[15] adres podglądu nie wskazuje wersji display");
  return m[1];
}

/** Treść strony galerii (HTML + dane RSC) tak, jak dostaje ją przeglądarka uczestnika. */
async function galleryHtml(context: BrowserContext, slug: string): Promise<string> {
  const res = await context.request.get(`/e/${slug}/zdjecia`);
  return res.text();
}

/**
 * Podmiana identyfikatora zdjęcia w żądaniach akcji serwera (POST z nagłówkiem Next-Action)
 * — symuluje spreparowane wywołanie akcji z przeglądarki z cudzym / ukrytym zdjęciem.
 */
async function rewriteActionIds(page: Page, slug: string, from: string, to: string) {
  await page.route(`**/e/${slug}/zdjecia**`, async (route) => {
    const req = route.request();
    const body = req.postData();
    if (req.method() === "POST" && req.headers()["next-action"] && body?.includes(from)) {
      await route.continue({ postData: body.split(from).join(to) });
    } else {
      await route.continue();
    }
  });
}

/**
 * Kliknięcie „To ja” i czekanie na odpowiedź właśnie tej akcji (argumenty kończą się wartością
 * logiczną) — nie na równoległe żądania adresów podglądu sąsiednich zdjęć.
 */
async function clickAndWaitForAction(page: Page, target: Locator) {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        !!r.request().headers()["next-action"] &&
        /,(true|false)]$/.test(r.request().postData() ?? ""),
    ),
    target.click(),
  ]);
}

async function tagsOf(attendeeId: string): Promise<string[]> {
  const { data } = await admin().from("event_photo_tags").select("photo_id").eq("attendee_id", attendeeId);
  return ((data ?? []) as { photo_id: string }[]).map((t) => t.photo_id);
}

// ─── Przygotowanie ───────────────────────────────────────────────────────────

test("logowanie organizatora, wydarzenia, uczestnicy i zdjęcia innego wydarzenia", async ({ page }) => {
  const { organizerEmail } = state();
  const { data: org, error } = await admin().from("organizations").select("id").eq("slug", "e2e-org").single();
  if (error || !org) throw new Error(`[15] organizacja e2e-org: ${error?.message ?? "brak"}`);

  const event = await insertEvent(org.id, `e2e-15-${RUN}`, `E2E Zdjęcia uczestnika ${RUN}`);
  const other = await insertEvent(org.id, `e2e-15-inne-${RUN}`, `E2E Inne wydarzenie 15 ${RUN}`);
  ctx.event = event;
  ctx.other = other;
  ctx.ola = await addAttendee(event.id, "Ola", { checkedIn: true });
  ctx.zofia = await addAttendee(event.id, "Zofia", { checkedIn: true });
  ctx.piotr = await addAttendee(event.id, "Piotr", { checkedIn: false });
  ctx.pawel = await addAttendee(event.id, "Paweł", { status: "pending", checkedIn: true });
  ctx.bartek = await addAttendee(other.id, "Bartek", { checkedIn: true });

  // Inne wydarzenie: galeria włączona i opublikowana, jedno gotowe zdjęcie.
  const { error: sErr } = await admin()
    .from("event_gallery_settings")
    .insert({ event_id: other.id, enabled: true, published_at: new Date().toISOString() });
  if (sErr) throw new Error(`[15] ustawienia galerii innego eventu: ${sErr.message}`);
  ctx.foreignId = await insertPhoto(other.id, { status: "ready" });

  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test("fotograf wgrywa zdjęcia przez link; w bazie także ukryte, przetwarzane i nieudane", async ({ browser }) => {
  const event = need("event");
  const { data: link, error } = await admin()
    .from("gallery_upload_links")
    .insert({ event_id: event.id, label: PHOTOGRAPHER, max_photos: 10 })
    .select("token")
    .single();
  if (error || !link) throw new Error(`[15] link fotografa: ${error?.message ?? "brak"}`);

  const photographer = await browser.newContext(NO_SESSION);
  const p = await photographer.newPage();
  await p.goto(`/g/${link.token}`);
  await expect(p.getByRole("heading", { name: event.name, level: 1 })).toBeVisible();
  const files = await Promise.all(
    Array.from({ length: UPLOADED }, async (_, i) => ({ name: `e2e-15-${i}.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg() })),
  );
  await p.locator("#photo-uploader-input").setInputFiles(files);
  await expect(p.getByText(new RegExp(`Wgrane: ${UPLOADED}\\b`))).toBeVisible({ timeout: 90_000 });
  await expect(p.getByText(/Błędy:/)).toHaveCount(0);
  await photographer.close();

  const { data: photos } = await admin()
    .from("event_photos")
    .select("id, status, hidden")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false });
  expect(photos ?? []).toHaveLength(UPLOADED);
  expect((photos ?? []).every((ph) => ph.status === "ready" && !ph.hidden)).toBe(true);
  // Równoległe wgrywanie może dać równe created_at — ustalamy jednoznaczną kolejność siatki.
  const base = Date.now();
  for (const [i, ph] of (photos ?? []).entries()) {
    const { error: uErr } = await admin()
      .from("event_photos")
      .update({ created_at: new Date(base - i * 60_000).toISOString() })
      .eq("id", ph.id);
    if (uErr) throw new Error(`[15] kolejność zdjęć: ${uErr.message}`);
  }

  // Zdjęcia niewidoczne dla uczestników — wstawione jako starsze niż wgrane (na końcu listy).
  ctx.hiddenId = await insertPhoto(event.id, { status: "ready", hidden: true });
  ctx.uploadingId = await insertPhoto(event.id, { status: "uploading" });
  ctx.failedId = await insertPhoto(event.id, { status: "failed" });

  const { data: ordered } = await admin()
    .from("event_photos")
    .select("id")
    .eq("event_id", event.id)
    .eq("status", "ready")
    .eq("hidden", false)
    .order("created_at", { ascending: false });
  ctx.uploadedIds = ((ordered ?? []) as { id: string }[]).map((r) => r.id);
  expect(ctx.uploadedIds).toHaveLength(UPLOADED);
});

// ─── Warunki dostępu ─────────────────────────────────────────────────────────

test("galeria wyłączona: brak pozycji „Zdjęcia”, /zdjecia zwraca 404", async ({ browser }) => {
  const event = need("event");
  const { context, page } = await participant(browser, event.slug, need("ola"));
  await expect(page.locator('a[href$="/zdjecia"]')).toHaveCount(0);
  const res = await page.goto(`/e/${event.slug}/zdjecia`);
  expect(res?.status()).toBe(404);
  await expect(page.locator('img[src*="/storage/v1/object/sign/"]')).toHaveCount(0);
  await context.close();
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("galeria włączona, ale nieopublikowana: „Galeria pojawi się wkrótce”, bez pozycji w menu", async ({ page, browser }) => {
    const event = need("event");
    await page.goto(`/admin/events/${event.id}/gallery?tab=ustawienia`);
    const toggle = page.locator("#g-enabled");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
    await expect(page.getByText("Zapisano.")).toBeVisible();
    await expect(page.getByText("Nieopublikowana")).toBeVisible();

    const { context, page: p } = await participant(browser, event.slug, need("ola"), { mobile: true });
    await expect(p.locator('a[href$="/zdjecia"]')).toHaveCount(0);
    await p.getByRole("button", { name: "Więcej" }).click();
    await expect(p.getByRole("link", { name: "Profil", exact: true })).toBeVisible();
    await expect(p.getByRole("link", { name: "Zdjęcia" })).toHaveCount(0);

    await openGallery(p, event.slug);
    await expect(p.getByText("Galeria pojawi się wkrótce. Zajrzyj tu po wydarzeniu.")).toBeVisible();
    await expect(p.locator('img[src*="/storage/v1/object/sign/"]')).toHaveCount(0);
    const html = await galleryHtml(context, event.slug);
    expect(html.includes("/storage/v1/object/sign/"), "brak podpisanych adresów przed publikacją").toBe(false);
    for (const id of need("uploadedIds")) expect(html.includes(id), "identyfikator zdjęcia przed publikacją").toBe(false);
    await context.close();
  });

  test("organizator publikuje galerię; uczestnik z check-inem widzi pozycję „Zdjęcia” na stronie i w menu", async ({ page, browser }) => {
    const event = need("event");
    await page.goto(`/admin/events/${event.id}/gallery?tab=ustawienia`);
    await page.getByRole("button", { name: "Opublikuj galerię" }).click();
    await expect(page.getByText("Galeria opublikowana.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cofnij publikację" })).toBeVisible();
    const { data: s } = await admin().from("event_gallery_settings").select("enabled, published_at").eq("event_id", event.id).single();
    expect(s?.enabled).toBe(true);
    expect(s?.published_at).not.toBeNull();

    // Strona główna wydarzenia (widok mobilny): kafelek i pozycja w „Więcej”.
    const { context, page: p } = await participant(browser, event.slug, need("ola"), { mobile: true });
    const tile = p.locator('a[href$="/zdjecia"]').first();
    await expect(tile).toHaveAttribute("href", new RegExp(`/e/${event.slug}/zdjecia$`));
    await p.getByRole("button", { name: "Więcej" }).click();
    const navLink = p.getByRole("link", { name: "Zdjęcia", exact: true }).last();
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(p).toHaveURL(new RegExp(`/e/${event.slug}/zdjecia$`));
    await expect(p.getByRole("heading", { name: `Zdjęcia – ${event.name}` })).toBeVisible();
    await context.close();
  });
});

test("uczestnik bez check-inu: brak pozycji w menu i komunikat zamiast zdjęć", async ({ browser }) => {
  const event = need("event");
  const { context, page } = await participant(browser, event.slug, need("piotr"));
  await expect(page.locator('a[href$="/zdjecia"]')).toHaveCount(0);
  await openGallery(page, event.slug);
  await expect(page.getByText("Zdjęcia są dostępne dla osób, które były na wydarzeniu.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Wszystkie/ })).toHaveCount(0);
  const html = await galleryHtml(context, event.slug);
  expect(html.includes("/storage/v1/object/sign/"), "brak podpisanych adresów bez check-inu").toBe(false);
  for (const id of need("uploadedIds")) expect(html.includes(id)).toBe(false);
  await context.close();
});

test("osoba anonimowa: /zdjecia przekierowuje na stronę wydarzenia, bez adresów zdjęć", async () => {
  const event = need("event");
  const api = await request.newContext({ baseURL: APP_URL, ...NO_SESSION });
  const res = await api.get(`/e/${event.slug}/zdjecia`, { maxRedirects: 0 });
  const body = await res.text();
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(res.headers()["location"] ?? "").toMatch(new RegExp(`/e/${event.slug}/?$`));
  expect(body.includes("/storage/v1/object/sign/")).toBe(false);
  for (const id of need("uploadedIds")) expect(body.includes(id)).toBe(false);
  await api.dispose();
});

test("uczestnik oczekujący (pending) nie widzi galerii — także z ciasteczkiem tokenu", async ({ browser }) => {
  const event = need("event");
  const pawel = need("pawel");
  const context = await browser.newContext(NO_SESSION);
  const page = await context.newPage();
  await page.goto(`/e/${event.slug}/a/${pawel.qr_code_token}`);
  await expect(page).toHaveURL(/\/a\/status\?reason=pending/);

  // Nawet z podstawionym ciasteczkiem tokenu osoby oczekującej galeria jest niedostępna.
  await context.addCookies([{ name: ATTENDEE_COOKIE, value: pawel.qr_code_token, url: APP_URL }]);
  await page.goto(`/e/${event.slug}/zdjecia`);
  await expect(page).not.toHaveURL(/\/zdjecia/);
  await expect(page.locator('img[src*="/storage/v1/object/sign/"]')).toHaveCount(0);
  const html = await galleryHtml(context, event.slug);
  expect(html.includes("/storage/v1/object/sign/")).toBe(false);
  for (const id of need("uploadedIds")) expect(html.includes(id)).toBe(false);
  await context.close();
});

test("uczestnik innego wydarzenia nie wchodzi do galerii tego wydarzenia", async ({ browser }) => {
  const event = need("event");
  const { context, page } = await participant(browser, need("other").slug, need("bartek"));
  await page.goto(`/e/${event.slug}/zdjecia`);
  await expect(page).not.toHaveURL(/\/zdjecia/);
  const html = await galleryHtml(context, event.slug);
  for (const id of need("uploadedIds")) expect(html.includes(id)).toBe(false);
  await context.close();
});

// ─── Widok uczestnika ────────────────────────────────────────────────────────

test("uczestnik widzi wyłącznie gotowe, nieukryte zdjęcia swojego wydarzenia", async ({ browser }) => {
  const event = need("event");
  const ids = need("uploadedIds");
  const { context, page } = await participant(browser, event.slug, need("ola"));
  await openGallery(page, event.slug);
  await expect(filterButton(page, "Wszystkie")).toHaveText(`Wszystkie (${UPLOADED})`);
  await expect(filterButton(page, "Wszystkie")).toHaveAttribute("aria-checked", "true");
  await expect(filterButton(page, "Moje zdjęcia")).toHaveText("Moje zdjęcia (0)");

  const thumbs = page.locator("main ul img");
  await expect(thumbs).toHaveCount(UPLOADED);
  for (let i = 0; i < UPLOADED; i++) {
    const img = thumbs.nth(i);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `miniatura ${i + 1}` }).toBe(true);
    expect((await img.getAttribute("src")) ?? "").toContain(`/${ids[i]}/thumb.jpg`);
  }

  const html = await galleryHtml(context, event.slug);
  for (const id of ids) expect(html.includes(id), "widoczne zdjęcie w danych strony").toBe(true);
  for (const id of [need("hiddenId"), need("uploadingId"), need("failedId"), need("foreignId")]) {
    expect(html.includes(id), "ukryte / nieprzetworzone / cudze zdjęcie nie trafia do strony").toBe(false);
  }
  await context.close();
});

test("podgląd: otwarcie, następne / poprzednie (przyciski i klawiatura), zamknięcie", async ({ browser }) => {
  const event = need("event");
  const ids = need("uploadedIds");
  const { context, page } = await participant(browser, event.slug, need("ola"));
  await openGallery(page, event.slug);

  await page.getByRole("button", { name: "Otwórz zdjęcie 1", exact: true }).click();
  const v = viewer(page);
  await expect(v.getByText(`Zdjęcie · 1 z ${UPLOADED}`)).toBeVisible();
  expect(await viewedPhotoId(page)).toBe(ids[0]);

  await v.getByRole("button", { name: "Następne zdjęcie" }).click();
  await expect(v.getByText(`Zdjęcie · 2 z ${UPLOADED}`)).toBeVisible();
  expect(await viewedPhotoId(page)).toBe(ids[1]);

  await page.keyboard.press("ArrowRight");
  await expect(v.getByText(`Zdjęcie · 3 z ${UPLOADED}`)).toBeVisible();
  expect(await viewedPhotoId(page)).toBe(ids[2]);

  await v.getByRole("button", { name: "Poprzednie zdjęcie" }).click();
  await expect(v.getByText(`Zdjęcie · 2 z ${UPLOADED}`)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(v.getByText(`Zdjęcie · ${UPLOADED} z ${UPLOADED}`)).toBeVisible();
  expect(await viewedPhotoId(page)).toBe(ids[UPLOADED - 1]);
  await page.keyboard.press("ArrowRight");
  await expect(v.getByText(`Zdjęcie · 1 z ${UPLOADED}`)).toBeVisible();

  await v.getByRole("button", { name: "Zamknij podgląd" }).click();
  await expect(v).toHaveCount(0);

  await page.getByRole("button", { name: "Otwórz zdjęcie 3", exact: true }).click();
  await expect(viewer(page).getByText(`Zdjęcie · 3 z ${UPLOADED}`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toHaveCount(0);
  await context.close();
});

test("„To ja”: oznaczenie zapisane w bazie, filtr „Moje zdjęcia”, cofnięcie", async ({ browser }) => {
  const event = need("event");
  const ids = need("uploadedIds");
  const ola = need("ola");
  const { context, page } = await participant(browser, event.slug, ola);
  await openGallery(page, event.slug);

  await page.getByRole("button", { name: "Otwórz zdjęcie 2", exact: true }).click();
  const v = viewer(page);
  expect(await viewedPhotoId(page)).toBe(ids[1]);
  const me = v.getByRole("button", { name: "To ja" });
  await expect(me).toHaveAttribute("aria-pressed", "false");
  await me.click();
  await expect(me).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => tagsOf(ola.id)).toEqual([ids[1]]);
  await v.getByRole("button", { name: "Zamknij podgląd" }).click();

  await expect(filterButton(page, "Moje zdjęcia")).toHaveText("Moje zdjęcia (1)");
  await expect(page.locator("li").nth(1).getByLabel("Oznaczone: to ja")).toBeVisible();

  // Po przeładowaniu oznaczenie zostaje; filtr pokazuje tylko oznaczone zdjęcie.
  await page.reload();
  await expect(filterButton(page, "Moje zdjęcia")).toHaveText("Moje zdjęcia (1)");
  await filterButton(page, "Moje zdjęcia").click();
  await expect(filterButton(page, "Moje zdjęcia")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("main ul img")).toHaveCount(1);
  expect((await page.locator("main ul img").first().getAttribute("src")) ?? "").toContain(`/${ids[1]}/thumb.jpg`);

  // Cofnięcie „To ja” w filtrze „Moje zdjęcia” — zdjęcie znika z listy, wiersz z bazy.
  await page.getByRole("button", { name: "Otwórz zdjęcie 1", exact: true }).click();
  const meAgain = viewer(page).getByRole("button", { name: "To ja" });
  await expect(meAgain).toHaveAttribute("aria-pressed", "true");
  await meAgain.click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.getByText("Nie masz jeszcze oznaczonych zdjęć.", { exact: false })).toBeVisible();
  await expect(filterButton(page, "Moje zdjęcia")).toHaveText("Moje zdjęcia (0)");
  await expect.poll(() => tagsOf(ola.id)).toEqual([]);

  await filterButton(page, "Wszystkie").click();
  await expect(page.locator("main ul img")).toHaveCount(UPLOADED);
  await context.close();
});

test("pobieranie zdjęcia: plik JPEG z nazwą wydarzenia", async ({ browser }) => {
  const event = need("event");
  const ids = need("uploadedIds");
  const { context, page } = await participant(browser, event.slug, need("ola"));
  await openGallery(page, event.slug);
  await page.getByRole("button", { name: "Otwórz zdjęcie 1", exact: true }).click();
  expect(await viewedPhotoId(page)).toBe(ids[0]);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    viewer(page).getByRole("button", { name: "Pobierz" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${event.slug}-zdjecie-${ids[0].replace(/-/g, "").slice(0, 8)}.jpg`);
  const file = await download.path();
  const meta = await sharp(fs.readFileSync(file)).metadata();
  expect(meta.format).toBe("jpeg");
  await context.close();
});

test("spreparowane wywołania akcji: cudze i ukryte zdjęcie — brak oznaczenia, zgłoszenia i adresu", async ({ browser }) => {
  const event = need("event");
  const ids = need("uploadedIds");
  const ola = need("ola");
  const foreignId = need("foreignId");
  const hiddenId = need("hiddenId");
  const { context, page } = await participant(browser, event.slug, ola);
  await openGallery(page, event.slug);

  // Podgląd: żądanie adresu dla ukrytego zdjęcia (zamiast pierwszego) — bez adresu.
  await rewriteActionIds(page, event.slug, ids[0], hiddenId);
  await page.getByRole("button", { name: "Otwórz zdjęcie 1", exact: true }).click();
  await expect(viewer(page).getByText("Zdjęcie jest niedostępne.")).toBeVisible();
  await expect(viewer(page).locator("img")).toHaveCount(0);
  await viewer(page).getByRole("button", { name: "Zamknij podgląd" }).click();
  await page.unrouteAll({ behavior: "wait" });

  // „To ja” na zdjęciu innego wydarzenia i na ukrytym zdjęciu.
  for (const target of [foreignId, hiddenId]) {
    await page.reload();
    await page.getByRole("button", { name: "Otwórz zdjęcie 2", exact: true }).click();
    expect(await viewedPhotoId(page)).toBe(ids[1]);
    await rewriteActionIds(page, event.slug, ids[1], target);
    await clickAndWaitForAction(page, viewer(page).getByRole("button", { name: "To ja" }));
    await expect(viewer(page).getByRole("button", { name: "To ja" })).toHaveAttribute("aria-pressed", "false");
    await page.unrouteAll({ behavior: "wait" });
  }
  expect(await tagsOf(ola.id)).toEqual([]);
  const { count: foreignTags } = await admin().from("event_photo_tags").select("photo_id", { count: "exact", head: true }).eq("photo_id", foreignId);
  expect(foreignTags).toBe(0);

  // „To ja” z podmienionym slugiem innego wydarzenia (ciasteczko nie pasuje do tamtego eventu).
  await page.reload();
  await page.getByRole("button", { name: "Otwórz zdjęcie 2", exact: true }).click();
  expect(await viewedPhotoId(page)).toBe(ids[1]);
  await page.route(`**/e/${event.slug}/zdjecia**`, async (route) => {
    const req = route.request();
    const body = req.postData();
    if (req.method() === "POST" && req.headers()["next-action"] && body?.includes(ids[1])) {
      await route.continue({ postData: body.split(`"${event.slug}"`).join(`"${need("other").slug}"`).split(ids[1]).join(foreignId) });
    } else await route.continue();
  });
  await clickAndWaitForAction(page, viewer(page).getByRole("button", { name: "To ja" }));
  await expect(viewer(page).getByRole("button", { name: "To ja" })).toHaveAttribute("aria-pressed", "false");
  await page.unrouteAll({ behavior: "wait" });
  expect(await tagsOf(ola.id)).toEqual([]);

  // Zgłoszenie zdjęcia innego wydarzenia.
  await page.reload();
  await page.getByRole("button", { name: "Otwórz zdjęcie 2", exact: true }).click();
  expect(await viewedPhotoId(page)).toBe(ids[1]);
  await rewriteActionIds(page, event.slug, ids[1], foreignId);
  await viewer(page).getByRole("button", { name: "Zgłoś zdjęcie" }).click();
  const dialog = page.getByRole("dialog", { name: "Zgłoś zdjęcie" });
  await dialog.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(dialog.getByText("Zdjęcie nie istnieje.")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await dialog.getByRole("button", { name: "Anuluj" }).click();

  const { count: reports } = await admin().from("event_photo_reports").select("id", { count: "exact", head: true }).eq("attendee_id", ola.id);
  expect(reports).toBe(0);
  const { count: foreignReports } = await admin().from("event_photo_reports").select("id", { count: "exact", head: true }).eq("photo_id", foreignId);
  expect(foreignReports).toBe(0);
  await context.close();
});

test("komunikat o błędzie „To ja” jest widoczny dla uczestnika (toast)", async ({ browser }) => {
  test.fail(true, "BŁĄD APLIKACJI: panel uczestnika nie renderuje <Toaster /> — komunikaty toast galerii (błąd „To ja”, „Dziękujemy” po zgłoszeniu, błąd pobierania) są niewidoczne");
  const event = need("event");
  const ids = need("uploadedIds");
  const { context, page } = await participant(browser, event.slug, need("ola"));
  await openGallery(page, event.slug);
  await page.getByRole("button", { name: "Otwórz zdjęcie 2", exact: true }).click();
  expect(await viewedPhotoId(page)).toBe(ids[1]);
  await rewriteActionIds(page, event.slug, ids[1], need("foreignId"));
  await clickAndWaitForAction(page, viewer(page).getByRole("button", { name: "To ja" }));
  await page.unrouteAll({ behavior: "wait" });
  expect(await tagsOf(need("ola").id)).toEqual([]);
  try {
    await expect(page.getByText("Nie udało się zapisać. Odśwież stronę.")).toBeVisible({ timeout: 5_000 });
  } finally {
    await context.close();
  }
});

// ─── Zgłoszenia ──────────────────────────────────────────────────────────────

test("zgłoszenie zdjęcia: walidacja, zapis w bazie, zdjęcie znika dla wszystkich uczestników", async ({ browser }) => {
  const event = need("event");
  const ids = need("uploadedIds");
  const ola = need("ola");
  const { context, page } = await participant(browser, event.slug, ola);
  const consoleTexts: string[] = [];
  page.on("console", (m) => consoleTexts.push(m.text()));
  await openGallery(page, event.slug);

  await page.getByRole("button", { name: "Otwórz zdjęcie 2", exact: true }).click();
  expect(await viewedPhotoId(page)).toBe(ids[1]);
  await viewer(page).getByRole("button", { name: "Zgłoś zdjęcie" }).click();
  const dialog = page.getByRole("dialog", { name: "Zgłoś zdjęcie" });
  await expect(dialog.getByRole("radio", { name: "Nie chcę być na tym zdjęciu" })).toBeChecked();
  await dialog.getByRole("radio", { name: "Inny powód" }).check();
  await dialog.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(dialog.getByText("Opisz krótko powód zgłoszenia.")).toBeVisible();
  const { count: none } = await admin().from("event_photo_reports").select("id", { count: "exact", head: true }).eq("event_id", event.id);
  expect(none).toBe(0);

  await dialog.getByLabel(/Wiadomość do organizatora/).fill(REPORT_TEXT);
  await dialog.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(dialog).toHaveCount(0);
  // Podgląd zostaje otwarty na kolejnym zdjęciu; zgłoszone zniknęło z listy.
  await expect(viewer(page).getByText(`Zdjęcie · 2 z ${UPLOADED - 1}`)).toBeVisible();
  expect(await viewedPhotoId(page)).toBe(ids[2]);
  await viewer(page).getByRole("button", { name: "Zamknij podgląd" }).click();
  await expect(filterButton(page, "Wszystkie")).toHaveText(`Wszystkie (${UPLOADED - 1})`);

  const { data: rows } = await admin()
    .from("event_photo_reports")
    .select("photo_id, attendee_id, kind, message, status, resolved_at")
    .eq("event_id", event.id);
  expect(rows ?? []).toHaveLength(1);
  const r = rows![0];
  expect(r).toMatchObject({ photo_id: ids[1], attendee_id: ola.id, kind: "other", status: "pending", resolved_at: null });
  expect(r.message === REPORT_TEXT, "treść zgłoszenia zapisana").toBe(true);
  expect(consoleTexts.some((t) => t.includes(REPORT_TEXT)), "treść zgłoszenia nie trafia do konsoli").toBe(false);

  await page.reload();
  await expect(filterButton(page, "Wszystkie")).toHaveText(`Wszystkie (${UPLOADED - 1})`);
  await context.close();

  // Druga osoba też nie widzi zgłoszonego zdjęcia (ani jego adresu).
  const z = await participant(browser, event.slug, need("zofia"));
  await openGallery(z.page, event.slug);
  await expect(filterButton(z.page, "Wszystkie")).toHaveText(`Wszystkie (${UPLOADED - 1})`);
  const html = await galleryHtml(z.context, event.slug);
  expect(html.includes(ids[1]), "zgłoszone zdjęcie nie trafia do strony").toBe(false);
  // Bezpośrednie żądanie adresu zgłoszonego zdjęcia — bez adresu.
  await rewriteActionIds(z.page, event.slug, ids[0], ids[1]);
  await z.page.getByRole("button", { name: "Otwórz zdjęcie 1", exact: true }).click();
  await expect(viewer(z.page).getByText("Zdjęcie jest niedostępne.")).toBeVisible();
  await z.context.close();
});

test.describe("zalogowany organizator — decyzje o zgłoszeniach", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("organizator widzi zgłoszenie i „Zostaw” przywraca zdjęcie (bez ponownego zgłoszenia przez tę osobę)", async ({ page, browser }) => {
    const event = need("event");
    const ids = need("uploadedIds");
    await page.goto(`/admin/events/${event.id}/gallery`);
    const card = page.locator('[data-slot="card"]', { has: page.getByText("Zgłoszenia (1)") });
    await expect(card).toBeVisible();
    await expect(card.getByText("Inny powód")).toBeVisible();
    await expect(card.getByText(/Ola Piętnasty/)).toBeVisible();
    expect(((await card.textContent()) ?? "").includes(REPORT_TEXT), "treść zgłoszenia widoczna dla organizatora").toBe(true);
    await expect(page.getByText("Zgłoszone", { exact: true })).toHaveCount(1);

    await card.getByRole("button", { name: "Zostaw" }).click();
    await expect(page.getByText("Zdjęcie zostaje w galerii.").first()).toBeVisible();
    await expect(page.getByText("Zgłoszenia (0)")).toBeVisible();
    await expect(page.getByText("Brak otwartych zgłoszeń.")).toBeVisible();
    await page.getByText("Rozpatrzone (1)").click();
    await expect(page.getByText(/Zostawione ·/)).toBeVisible();

    const { data: r } = await admin().from("event_photo_reports").select("status, resolved_at, photo_id").eq("event_id", event.id).single();
    expect(r?.status).toBe("kept");
    expect(r?.resolved_at).not.toBeNull();
    expect(r?.photo_id).toBe(ids[1]);

    // Zdjęcie wraca do galerii; ta sama osoba nie może zgłosić go drugi raz.
    const { context, page: p } = await participant(browser, event.slug, need("ola"));
    await openGallery(p, event.slug);
    await expect(filterButton(p, "Wszystkie")).toHaveText(`Wszystkie (${UPLOADED})`);
    await p.getByRole("button", { name: "Otwórz zdjęcie 2", exact: true }).click();
    expect(await viewedPhotoId(p)).toBe(ids[1]);
    await expect(viewer(p).getByRole("button", { name: "Zgłoszone" })).toBeDisabled();
    await context.close();
  });

  test("zgłoszenie „Nie chcę być na tym zdjęciu” → organizator „Usuń”: zdjęcie i pliki skasowane", async ({ page, browser }) => {
    const event = need("event");
    const ids = need("uploadedIds");
    const zofia = need("zofia");
    const target = ids[2];

    const z = await participant(browser, event.slug, zofia);
    await openGallery(z.page, event.slug);
    await z.page.getByRole("button", { name: "Otwórz zdjęcie 3", exact: true }).click();
    expect(await viewedPhotoId(z.page)).toBe(target);
    await viewer(z.page).getByRole("button", { name: "Zgłoś zdjęcie" }).click();
    const dialog = z.page.getByRole("dialog", { name: "Zgłoś zdjęcie" });
    await dialog.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await admin().from("event_photo_reports").select("id").eq("photo_id", target)).data?.length ?? 0)
      .toBe(1);
    await z.context.close();

    const { data: rep } = await admin().from("event_photo_reports").select("id, kind, message, status").eq("photo_id", target).single();
    expect(rep).toMatchObject({ kind: "remove_me", message: null, status: "pending" });
    const { data: photoRow } = await admin().from("event_photos").select("display_path, thumb_path").eq("id", target).single();

    await page.goto(`/admin/events/${event.id}/gallery`);
    const card = page.locator('[data-slot="card"]', { has: page.getByText("Zgłoszenia (1)") });
    await expect(card.getByText("Nie chcę być na tym zdjęciu")).toBeVisible();
    await expect(card.getByText(/Zofia Piętnasty/)).toBeVisible();
    await card.getByRole("button", { name: "Usuń" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText("Usunąć zgłoszone zdjęcie?")).toBeVisible();
    await confirm.getByRole("button", { name: "Usuń" }).click();
    await expect(page.getByText("Zdjęcie usunięte.").first()).toBeVisible();
    await expect(page.getByText("Zgłoszenia (0)")).toBeVisible();

    await expect
      .poll(async () => (await admin().from("event_photos").select("id").eq("id", target)).data?.length ?? -1)
      .toBe(0);
    const { data: closed } = await admin().from("event_photo_reports").select("status, resolved_at, photo_id").eq("id", rep!.id).single();
    expect(closed?.status).toBe("removed");
    expect(closed?.resolved_at).not.toBeNull();
    expect(closed?.photo_id).toBeNull();
    const folder = `${event.id}/${target}`;
    const { data: left } = await admin().storage.from("event-photos").list(folder);
    expect((left ?? []).length, "pliki usuniętego zdjęcia skasowane").toBe(0);
    expect(photoRow?.display_path).toBeTruthy();

    const o = await participant(browser, event.slug, need("ola"));
    await openGallery(o.page, event.slug);
    await expect(filterButton(o.page, "Wszystkie")).toHaveText(`Wszystkie (${UPLOADED - 1})`);
    expect((await galleryHtml(o.context, event.slug)).includes(target)).toBe(false);
    await o.context.close();
  });

  test("organizator ukrywa zdjęcie — znika u uczestników, bez nowego adresu; „Pokaż” przywraca", async ({ page, browser }) => {
    const event = need("event");
    const ids = need("uploadedIds");
    const target = ids[0];
    const { data: row } = await admin().from("event_photos").select("thumb_path").eq("id", target).single();

    await page.goto(`/admin/events/${event.id}/gallery`);
    const tile = page.locator("li", { has: page.locator(`img[src*="/${target}/thumb.jpg"]`) });
    await tile.getByRole("button", { name: "Ukryj przed uczestnikami" }).click();
    await expect(tile.getByText("Ukryte")).toBeVisible();
    await expect.poll(async () => (await admin().from("event_photos").select("hidden").eq("id", target).single()).data?.hidden).toBe(true);
    expect(row?.thumb_path).toBeTruthy();

    const o = await participant(browser, event.slug, need("ola"));
    await openGallery(o.page, event.slug);
    await expect(filterButton(o.page, "Wszystkie")).toHaveText(`Wszystkie (${UPLOADED - 2})`);
    expect((await galleryHtml(o.context, event.slug)).includes(target), "ukryte zdjęcie nie trafia do strony").toBe(false);
    await rewriteActionIds(o.page, event.slug, ids[1], target);
    await o.page.getByRole("button", { name: "Otwórz zdjęcie 1", exact: true }).click();
    await expect(viewer(o.page).getByText("Zdjęcie jest niedostępne.")).toBeVisible();
    await o.page.unrouteAll({ behavior: "wait" });
    await o.context.close();

    await tile.getByRole("button", { name: "Pokaż uczestnikom" }).click();
    await expect.poll(async () => (await admin().from("event_photos").select("hidden").eq("id", target).single()).data?.hidden).toBe(false);
  });

  test("cofnięcie publikacji i wyłączenie galerii zamykają dostęp — także otwartej już strony", async ({ page, browser }) => {
    const event = need("event");
    const ids = need("uploadedIds");
    const ola = need("ola");
    const o = await participant(browser, event.slug, ola);
    await openGallery(o.page, event.slug);
    await expect(o.page.locator("main ul img").first()).toBeVisible();

    await page.goto(`/admin/events/${event.id}/gallery?tab=ustawienia`);
    await page.getByRole("button", { name: "Cofnij publikację" }).click();
    await expect(page.getByText("Publikacja cofnięta.")).toBeVisible();

    // Otwarta strona: akcja „To ja” sprawdza dostęp od nowa.
    await o.page.getByRole("button", { name: "Otwórz zdjęcie 1", exact: true }).click();
    await expect(viewer(o.page).getByText("Zdjęcie jest niedostępne.")).toBeVisible();
    await clickAndWaitForAction(o.page, viewer(o.page).getByRole("button", { name: "To ja" }));
    await expect(viewer(o.page).getByRole("button", { name: "To ja" })).toHaveAttribute("aria-pressed", "false");
    expect(await tagsOf(ola.id)).toEqual([]);

    await o.page.goto(`/e/${event.slug}`);
    await expect(o.page.locator('a[href$="/zdjecia"]')).toHaveCount(0);
    await openGallery(o.page, event.slug);
    await expect(o.page.getByText("Galeria pojawi się wkrótce. Zajrzyj tu po wydarzeniu.")).toBeVisible();
    const html = await galleryHtml(o.context, event.slug);
    for (const id of ids) expect(html.includes(id)).toBe(false);

    const toggle = page.locator("#g-enabled");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
    await expect(page.getByText("Zapisano.")).toBeVisible();
    const res = await o.page.goto(`/e/${event.slug}/zdjecia`);
    expect(res?.status()).toBe(404);
    await o.context.close();
  });
});
