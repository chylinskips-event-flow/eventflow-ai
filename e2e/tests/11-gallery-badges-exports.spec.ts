import { expect, request, test, type APIResponse } from "@playwright/test";
import sharp from "sharp";
import { APP_URL } from "../env";
import { admin, loginWithMagicLink, state } from "../helpers";

// Galeria (część 1) i dokumenty: włączenie galerii, link fotografa /g/{token}, wgranie JPEG
// bez logowania, zdjęcie w panelu organizatora, unieważnienie linku; PDF identyfikatorów
// oraz eksporty CSV (logistyka stoisk, leady partnera) — tylko dla organizatora.
// Plik jest niezależny od innych specyfikacji: sam loguje organizatora i tworzy własne dane.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-11.json";
// Fotograf i osoby anonimowe — czysta przeglądarka, bez sesji organizatora.
const NO_SESSION = { storageState: { cookies: [], origins: [] } };
const RUN = Date.now().toString(36);
const PHOTOGRAPHER = `Fotograf E2E 11 ${RUN}`;

type Ctx = { orgId: string; eventId: string; eventSlug: string; eventName: string; linkId: string; token: string };
const ctx: Partial<Ctx> = {};
const need = <K extends keyof Ctx>(key: K): Ctx[K] => {
  const v = ctx[key];
  if (v === undefined) throw new Error(`Brak ${key} — wcześniejszy test w pliku 11 nie przeszedł.`);
  return v as Ctx[K];
};

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function insertEvent(orgId: string, slug: string, name: string) {
  const { data, error } = await admin()
    .from("events")
    .insert({
      organization_id: orgId,
      slug,
      name,
      timezone: "Europe/Warsaw",
      starts_at: at(7, 8),
      ends_at: at(7, 16),
      location: "Łódź, Hala Expo",
      status: "published",
      requires_approval: false,
    })
    .select("id, slug, name")
    .single();
  if (error) throw new Error(`[11] wydarzenie ${slug}: ${error.message}`);
  return data as { id: string; slug: string; name: string };
}

async function addAttendee(eventId: string, first: string, status: "approved" | "pending" = "approved") {
  const { data, error } = await admin()
    .from("attendees")
    .insert({
      event_id: eventId,
      first_name: first,
      last_name: "Jedenasty",
      email: `${first.toLowerCase()}.${RUN}.11@e2e.test`,
      company: "Firma 11",
      status,
    })
    .select("id, email, qr_code_token")
    .single();
  if (error) throw new Error(`[11] uczestnik ${first}: ${error.message}`);
  return data as { id: string; email: string; qr_code_token: string };
}

/** Mały, poprawny JPEG 640×480 o losowym kolorze (inny skrót SHA-256 przy każdym uruchomieniu). */
async function makeJpeg(): Promise<Buffer> {
  const rnd = () => Math.floor(Math.random() * 256);
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: rnd(), g: rnd(), b: rnd() } } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Odpowiedź dla osoby bez sesji: brak pliku — przekierowanie do logowania albo 401/403/404. */
function expectRefused(res: APIResponse, fileType: RegExp) {
  expect(res.headers()["content-type"] ?? "", "plik wydany anonimowo").not.toMatch(fileType);
  expect(res.headers()["content-disposition"] ?? "").not.toMatch(/attachment/i);
  const status = res.status();
  if (status >= 300 && status < 400) {
    expect(res.headers()["location"] ?? "").toMatch(/\/login/);
  } else {
    expect([401, 403, 404]).toContain(status);
  }
}

async function anonymousGet(path: string): Promise<APIResponse> {
  const api = await request.newContext({ baseURL: APP_URL, ...NO_SESSION });
  const res = await api.get(path, { maxRedirects: 0 });
  await res.body();
  await api.dispose();
  return res;
}

test("logowanie organizatora i własne wydarzenie dla pliku 11", async ({ page }) => {
  const { organizerEmail } = state();
  const { data: org, error } = await admin().from("organizations").select("id").eq("slug", "e2e-org").single();
  if (error || !org) throw new Error(`[11] organizacja e2e-org: ${error?.message ?? "brak"}`);
  ctx.orgId = org.id;
  const event = await insertEvent(org.id, `e2e-11-${RUN}`, `E2E Galeria i Dokumenty ${RUN}`);
  ctx.eventId = event.id;
  ctx.eventSlug = event.slug;
  ctx.eventName = event.name;

  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("zalogowany organizator", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("galeria: organizator włącza galerię dla uczestników", async ({ page }) => {
    const eventId = need("eventId");
    await page.goto(`/admin/events/${eventId}/gallery?tab=ustawienia`);
    await expect(page.getByRole("heading", { name: "Galeria", level: 1 })).toBeVisible();

    const toggle = page.locator("#g-enabled");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
    await expect(page.getByText("Zapisano.")).toBeVisible();

    await expect
      .poll(async () => {
        const { data } = await admin().from("event_gallery_settings").select("enabled").eq("event_id", eventId).maybeSingle();
        return data?.enabled ?? null;
      })
      .toBe(true);

    await page.reload();
    await expect(page.locator("#g-enabled")).toHaveAttribute("aria-checked", "true");
  });

  test("galeria: organizator tworzy link dla fotografa", async ({ page }) => {
    const eventId = need("eventId");
    await page.goto(`/admin/events/${eventId}/gallery?tab=fotograf`);
    await page.locator("#gl-label").fill(PHOTOGRAPHER);
    await page.locator("#gl-max").fill("5");
    await page.getByRole("button", { name: "Utwórz link" }).click();
    await expect(page.getByText("Link utworzony.")).toBeVisible();

    const { data: link, error } = await admin()
      .from("gallery_upload_links")
      .select("id, token, label, max_photos, revoked_at")
      .eq("event_id", eventId)
      .eq("label", PHOTOGRAPHER)
      .single();
    if (error || !link) throw new Error(`[11] link fotografa: ${error?.message ?? "brak"}`);
    expect(link.max_photos).toBe(5);
    expect(link.revoked_at).toBeNull();
    expect(link.token).toBeTruthy();
    ctx.linkId = link.id;
    ctx.token = link.token;

    const row = page.locator("li", { hasText: PHOTOGRAPHER });
    await expect(row.getByText("zdjęć: 0 / 5")).toBeVisible();
    await expect(row.locator("code")).toHaveText(new RegExp(`/g/${link.token}$`));
    await expect(row.getByRole("link", { name: "Otwórz" })).toHaveAttribute("href", new RegExp(`/g/${link.token}$`));
  });

  test("fotograf bez logowania wgrywa JPEG przez /g/{token}", async ({ browser }) => {
    const eventId = need("eventId");
    const token = need("token");
    const linkId = need("linkId");

    const photographer = await browser.newContext(NO_SESSION);
    const p = await photographer.newPage();
    await p.goto(`/g/${token}`);
    await expect(p.getByRole("heading", { name: need("eventName"), level: 1 })).toBeVisible();
    await expect(p.getByText(`Fotograf: ${PHOTOGRAPHER}`)).toBeVisible();
    await expect(p.getByText(/Limit tego linku: 5 zdjęć\./)).toBeVisible();

    await p.locator("#photo-uploader-input").setInputFiles({ name: "e2e-11.jpg", mimeType: "image/jpeg", buffer: await makeJpeg() });
    await expect(p.getByText(/Wgrane: 1\b/)).toBeVisible({ timeout: 60_000 });
    await expect(p.getByText(/Błędy:/)).toHaveCount(0);
    // Strona fotografa nie pokazuje galerii (żadnych miniatur).
    await expect(p.locator("img")).toHaveCount(0);
    await photographer.close();

    const { data: photos } = await admin()
      .from("event_photos")
      .select("id, status, upload_link_id, uploaded_by, original_path, display_path, thumb_path, width, height, hidden")
      .eq("event_id", eventId);
    expect(photos ?? []).toHaveLength(1);
    const photo = photos![0];
    expect(photo.status).toBe("ready");
    expect(photo.upload_link_id).toBe(linkId);
    expect(photo.uploaded_by).toBeNull();
    expect(photo.hidden).toBe(false);
    // Oryginał nie jest przechowywany: pod jego ścieżką zostaje pusta zaślepka (blokuje ponowną
    // wysyłkę pod tę ścieżkę, dopóki podpisany adres jest ważny).
    expect(photo.original_path, "ścieżka oryginału zajęta zaślepką").toBeTruthy();
    const { data: placeholder, error: placeholderError } = await admin().storage.from("event-photos").download(photo.original_path);
    expect(placeholderError).toBeNull();
    expect((await placeholder!.arrayBuffer()).byteLength, "oryginał usunięty po przetworzeniu (0 B)").toBe(0);
    expect(photo.display_path).toBeTruthy();
    expect(photo.thumb_path).toBeTruthy();
    // Mały plik nie jest powiększany (max 2560 px, bez powiększania).
    expect(photo.width).toBe(640);
    expect(photo.height).toBe(480);

    const { data: thumb, error } = await admin().storage.from("event-photos").download(photo.thumb_path);
    expect(error).toBeNull();
    const meta = await sharp(Buffer.from(await thumb!.arrayBuffer())).metadata();
    expect(meta.format).toBe("jpeg");
  });

  test("zdjęcie od fotografa widać w panelu organizatora", async ({ page }) => {
    const eventId = need("eventId");
    await page.goto(`/admin/events/${eventId}/gallery`);
    await expect(page.getByText(`Fotograf: ${PHOTOGRAPHER}`)).toBeVisible();
    await expect(page.getByText("Nie ma jeszcze zdjęć.")).toHaveCount(0);

    const tile = page.locator("li", { hasText: `Fotograf: ${PHOTOGRAPHER}` });
    const thumb = tile.locator("img");
    await expect(thumb).toBeVisible();
    await expect
      .poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { message: "miniatura się wczytała" })
      .toBe(true);

    await tile.getByRole("button", { name: "Powiększ" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Podgląd zdjęcia 1 z 1")).toBeVisible();
    await expect(dialog.locator("img")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto(`/admin/events/${eventId}/gallery?tab=fotograf`);
    await expect(page.locator("li", { hasText: PHOTOGRAPHER }).getByText("zdjęć: 1 / 5")).toBeVisible();
  });

  test("unieważniony link fotografa przestaje działać", async ({ page, browser }) => {
    const eventId = need("eventId");
    const token = need("token");
    await page.goto(`/admin/events/${eventId}/gallery?tab=fotograf`);
    page.once("dialog", (d) => void d.accept());
    await page.locator("li", { hasText: PHOTOGRAPHER }).getByRole("button", { name: "Unieważnij" }).click();
    await expect(page.getByText("Nieaktywne linki (1)")).toBeVisible();

    const { data } = await admin().from("gallery_upload_links").select("revoked_at").eq("id", need("linkId")).single();
    expect(data?.revoked_at).not.toBeNull();

    const anonCtx = await browser.newContext(NO_SESSION);
    const p = await anonCtx.newPage();
    await p.goto(`/g/${token}`);
    await expect(p.getByRole("heading", { name: "Link jest nieaktywny" })).toBeVisible();
    await expect(p.locator("#photo-uploader-input")).toHaveCount(0);
    await p.goto(`/g/nieistniejacy-${RUN}`);
    await expect(p.getByRole("heading", { name: "Link jest nieaktywny" })).toBeVisible();
    await anonCtx.close();
  });

  test("identyfikatory PDF: organizator pobiera, anonim i obcy organizator nie", async ({ page }) => {
    const eventId = need("eventId");
    await addAttendee(eventId, "Bartek");
    await addAttendee(eventId, "Celina");
    await addAttendee(eventId, "Dawid", "pending");

    const res = await page.request.get(`/admin/events/${eventId}/badges`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect(res.headers()["content-disposition"]).toContain(`identyfikatory-${need("eventSlug")}-approved.pdf`);
    const pdf = await res.body();
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);

    // Anonimowo: bez pliku (przekierowanie do logowania albo 401/403/404).
    expectRefused(await anonymousGet(`/admin/events/${eventId}/badges`), /pdf/i);

    // Wydarzenie innej organizacji: zalogowany organizator nie dostaje cudzych identyfikatorów.
    const { data: other, error } = await admin().auth.admin.createUser({ email: `obcy.${RUN}.11@e2e.test`, email_confirm: true });
    if (error || !other.user) throw new Error(`[11] obcy organizator: ${error?.message}`);
    const { data: otherOrg, error: orgError } = await admin()
      .from("organizations")
      .insert({ name: "Obca Organizacja 11", slug: `e2e-obca-11-${RUN}`, owner_user_id: other.user.id, billing_email: `obcy.${RUN}.11@e2e.test` })
      .select("id")
      .single();
    if (orgError || !otherOrg) throw new Error(`[11] obca organizacja: ${orgError?.message}`);
    const foreign = await insertEvent(otherOrg.id, `e2e-obce-11-${RUN}`, "Obce wydarzenie 11");
    await addAttendee(foreign.id, "Edyta");
    const foreignRes = await page.request.get(`/admin/events/${foreign.id}/badges`, { maxRedirects: 0 });
    expect(foreignRes.headers()["content-type"] ?? "").not.toContain("application/pdf");
    expect(foreignRes.status()).toBe(404);
  });

  test("anonim wchodzący na adres panelu /admin trafia na stronę logowania", async ({ browser }) => {
    const eventId = need("eventId");
    const anonCtx = await browser.newContext(NO_SESSION);
    const p = await anonCtx.newPage();
    try {
      // Middleware (updateSession): niezalogowany na /admin* → /login.
      const direct = await anonymousGet(`/admin/events/${eventId}/badges`);
      expect(direct.status()).toBeGreaterThanOrEqual(300);
      expect(direct.status()).toBeLessThan(400);
      expect(direct.headers()["location"] ?? "").toMatch(/\/login/);

      await p.goto(`/admin/events/${eventId}/badges`);
      await expect(p).toHaveURL(/\/login/, { timeout: 5_000 });
      await p.goto(`/admin`);
      await expect(p).toHaveURL(/\/login/, { timeout: 5_000 });
    } finally {
      await anonCtx.close();
    }
  });

  test("eksporty CSV logistyki i leadów: organizator pobiera, anonim nie", async ({ page }) => {
    const eventId = need("eventId");
    const slug = need("eventSlug");

    // Logistyka stoisk — oba widoki, CSV dla polskiego Excela (BOM + średnik).
    for (const [view, header, file] of [
      ["totals", "Pozycja;Jednostka;Zatwierdzone;Oczekujące", `logistyka-sumy-${slug}.csv`],
      ["booths", "Partner;Poziom;Stoisko;Pozycja", `logistyka-stoiska-${slug}.csv`],
    ] as const) {
      const res = await page.request.get(`/admin/events/${eventId}/partners/logistics/logistics.csv?view=${view}`);
      expect(res.status(), `logistyka ${view}`).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/csv");
      expect(res.headers()["content-disposition"]).toContain(file);
      const body = await res.body();
      expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(body.toString("utf8").replace(/^﻿/, "")).toMatch(new RegExp(`^${header}`));
    }

    // Leady partnera: tylko osoby ze zgodą na przekazanie danych.
    const db = admin();
    const { data: partner, error: pErr } = await db
      .from("partners")
      .insert({ event_id: eventId, name: "Partner Jedenasty", tier: "gold" })
      .select("id")
      .single();
    if (pErr || !partner) throw new Error(`[11] partner: ${pErr?.message}`);
    const lena = await addAttendee(eventId, "Lena");
    const olek = await addAttendee(eventId, "Olek");
    const { data: checkins, error: cErr } = await db
      .from("checkins")
      .insert([
        { attendee_id: lena.id, partner_id: partner.id, lead_consent_given: true },
        { attendee_id: olek.id, partner_id: partner.id, lead_consent_given: false },
      ])
      .select("id, attendee_id");
    if (cErr || !checkins) throw new Error(`[11] wizyty u partnera: ${cErr?.message}`);
    const lenaCheckin = checkins.find((c) => c.attendee_id === lena.id)!;
    const { error: lcErr } = await db.from("lead_consents").insert({ checkin_id: lenaCheckin.id, consent_text_version: "v1-e2e" });
    if (lcErr) throw new Error(`[11] zgoda: ${lcErr.message}`);

    const leadsPath = `/admin/events/${eventId}/partners/${partner.id}/leads.csv`;
    const leads = await page.request.get(leadsPath);
    expect(leads.status()).toBe(200);
    expect(leads.headers()["content-type"]).toContain("text/csv");
    expect(leads.headers()["content-disposition"]).toContain("leads-partner_jedenasty.csv");
    const csv = (await leads.body()).toString("utf8").replace(/^﻿/, "");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toBe("first_name;last_name;email;company;job_title;consented_at;consent_text_version");
    expect(lines).toHaveLength(2);
    expect(csv).toContain(lena.email);
    expect(csv).toContain("v1-e2e");
    expect(csv).not.toContain(olek.email);

    // Partner z innego wydarzenia pod adresem tego wydarzenia — brak danych.
    const { partnerId: seededPartner } = state();
    const swapped = await page.request.get(`/admin/events/${eventId}/partners/${seededPartner}/leads.csv`, { maxRedirects: 0 });
    expect(swapped.headers()["content-type"] ?? "").not.toContain("text/csv");
    expect(swapped.status()).toBe(404);

    // Anonimowo: żaden eksport nie wychodzi.
    expectRefused(await anonymousGet(`/admin/events/${eventId}/partners/logistics/logistics.csv`), /csv/i);
    expectRefused(await anonymousGet(`/admin/events/${eventId}/partners/logistics/logistics.csv?view=booths`), /csv/i);
    expectRefused(await anonymousGet(leadsPath), /csv/i);
  });
});
