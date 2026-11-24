import { expect, test, type Page, type Route } from "@playwright/test";
import QRCode from "qrcode";
import { admin, loginWithMagicLink, state } from "../helpers";

// Recepcja: druk identyfikatora jednej osoby na Niimbot B1 (Web Bluetooth).
// Fizycznego druku nie da się sprawdzić — testujemy przycisk przy osobie (panel organizatora
// i link obsługi), okno z podglądem etykiety (canvas 384×240, 1 bit, QR wymiany kontaktów),
// długie nazwy i polskie znaki, dane zwracane przez akcję (bez e-maila i tokenów), odmowy akcji
// (nieaktywny link, osoba z innego wydarzenia, oczekujący), komunikaty drukarki przy podmienionym
// navigator.bluetooth oraz to, że sterownik drukarki ładuje się dopiero po otwarciu okna.
//
// Plik jest niezależny od innych: loguje się sam i tworzy własne wydarzenia w organizacji E2E.

test.describe.configure({ mode: "serial" });

const ORGANIZER_STATE = "e2e/.organizer-16.json";
const NO_SESSION = { storageState: { cookies: [], origins: [] } };

const SUFFIX = Date.now().toString(36);
const EVENT_NAME = "E2E16 Druk Identyfikatorów";
const OTHER_EVENT_NAME = "E2E16 Inne Wydarzenie";

// Wymiary z src/lib/badge-label-core.ts (B1_LABEL_SIZE) i układ z badge-label-canvas.ts.
const LABEL_W = 384;
const LABEL_H = 240;
const MARGIN = 12;
const QR_BOX = 136;
const QR_GAP = 10;

const UNSUPPORTED = /Ta przeglądarka nie obsługuje drukarek Bluetooth/;

type Person = { id: string; contact_code: string; first: string; last: string; company: string | null };
type Fixture = {
  eventId: string;
  slug: string;
  receptionToken: string;
  otherEventId: string;
  short: Person;
  polish: Person;
  noSpaces: Person;
  noCompany: Person;
  pending: Person;
  otherEvent: Person;
};
let fixture: Fixture | null = null;

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function emailFor(first: string, last: string) {
  const ascii = (v: string) =>
    v.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  return `${ascii(first).slice(0, 20)}.${ascii(last).slice(0, 20)}.${SUFFIX}.16@e2e.test`;
}

async function addAttendee(
  eventId: string,
  first: string,
  last: string,
  company: string | null,
  status: "approved" | "pending" = "approved",
): Promise<Person> {
  const { data, error } = await admin()
    .from("attendees")
    .insert({ event_id: eventId, first_name: first, last_name: last, company, email: emailFor(first, last), status })
    .select("id, contact_code")
    .single();
  if (error || !data) throw new Error(`[16] uczestnik ${first}: ${error?.message ?? "brak"}`);
  return { id: data.id, contact_code: data.contact_code, first, last, company };
}

async function ensureFixture(): Promise<Fixture> {
  if (fixture) return fixture;
  const db = admin();
  const { data: org, error: orgErr } = await db.from("organizations").select("id").eq("slug", "e2e-org").single();
  if (orgErr || !org) throw new Error(`[16] organizacja E2E: ${orgErr?.message ?? "brak"}`);
  const base = {
    organization_id: org.id,
    status: "published",
    requires_approval: false,
    timezone: "Europe/Warsaw",
    starts_at: at(12, 8),
    ends_at: at(12, 16),
    location: "Łódź, Hala Expo",
  };
  const slug = `e2e-16-druk-${SUFFIX}`;
  const receptionToken = `e2e16-recepcja-${SUFFIX}-${Math.random().toString(36).slice(2)}`;
  const { data: ev, error } = await db
    .from("events")
    .insert({ ...base, slug, name: EVENT_NAME, reception_token: receptionToken })
    .select("id")
    .single();
  if (error || !ev) throw new Error(`[16] wydarzenie: ${error?.message ?? "brak"}`);
  const { data: other, error: otherErr } = await db
    .from("events")
    .insert({ ...base, slug: `e2e-16-inne-${SUFFIX}`, name: OTHER_EVENT_NAME })
    .select("id")
    .single();
  if (otherErr || !other) throw new Error(`[16] drugie wydarzenie: ${otherErr?.message ?? "brak"}`);

  fixture = {
    eventId: ev.id,
    slug,
    receptionToken,
    otherEventId: other.id,
    short: await addAttendee(ev.id, "Adam", "Etykietowy", "Firma Krótka"),
    polish: await addAttendee(
      ev.id,
      "Zażółć",
      "Gęślą-Jaźń",
      "Przedsiębiorstwo Handlowo-Usługowe Żółwiowe Źródła Łódzkiego Ślęża Sp. z o.o. Spółka Komandytowa Oddział Wielkopolski",
    ),
    noSpaces: await addAttendee(ev.id, "Bartłomiej", "Konstantynopolitańczykowiankówny-Brzęczyszczykiewicz", "Ąę"),
    noCompany: await addAttendee(ev.id, "Celina", "Bezfirmowa", null),
    pending: await addAttendee(ev.id, "Damian", "Oczekujący", "Firma P", "pending"),
    otherEvent: await addAttendee(other.id, "Edyta", "Obcowydarzeniowa", "Firma Obca"),
  };
  return fixture;
}

function fullName(p: Person) {
  return `${p.first} ${p.last}`;
}

function receptionRow(page: Page, name: string) {
  return page.locator("div.rounded-lg.border", { hasText: name });
}

function printButton(page: Page, p: Person) {
  return page.getByRole("button", { name: `Drukuj identyfikator: ${fullName(p)}` });
}

function labelDialog(page: Page) {
  return page.getByRole("dialog", { name: "Drukuj identyfikator" });
}

/**
 * Podmiana navigator.bluetooth (Chrome w testach nie ma drukarki). Tryb wybiera window.__btMode:
 * cancel / notfound / security / gatt. Wywołania requestDevice trafiają do window.__btCalls.
 */
async function stubBluetooth(page: Page, mode: "cancel" | "notfound" | "security" | "gatt" | "remove") {
  await page.addInitScript((m) => {
    const w = window as unknown as { __btMode: string; __btCalls: unknown[] };
    w.__btMode = m;
    w.__btCalls = [];
    if (m === "remove") {
      delete (Navigator.prototype as unknown as { bluetooth?: unknown }).bluetooth;
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
      return;
    }
    const fake = {
      getAvailability: async () => true,
      requestDevice: async (opts: unknown) => {
        w.__btCalls.push(opts);
        await new Promise((r) => setTimeout(r, 150));
        switch (w.__btMode) {
          case "cancel":
            throw new DOMException("User cancelled the requestDevice() chooser.", "NotFoundError");
          case "notfound":
            throw new DOMException("Bluetooth adapter not available.", "NotFoundError");
          case "security":
            throw new DOMException("Must be handling a user gesture to show a permission request.", "SecurityError");
          default:
            return {
              name: "B1-E2E",
              gatt: {
                connected: false,
                connect: async () => {
                  throw new DOMException("GATT Server is disconnected. Cannot perform GATT operations.", "NetworkError");
                },
              },
            };
        }
      },
    };
    Object.defineProperty(Navigator.prototype, "bluetooth", { configurable: true, get: () => fake });
  }, mode);
}

/**
 * Surowa odpowiedź akcji serwera z etykietą (RSC). Pobierana przez route.fetch, bo treść z CDP
 * (text/x-component bez charset) przychodzi źle zdekodowana („KrÃ³tka”). Opcjonalnie podmienia
 * identyfikator uczestnika w żądaniu — sprawdzenie autoryzacji po stronie serwera.
 */
async function captureLabelAction(
  page: Page,
  open: () => Promise<void>,
  swap?: { from: string; to: string },
): Promise<string> {
  let resolve!: (body: string) => void;
  const captured = new Promise<string>((r) => (resolve = r));
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return route.fallback();
    const postData = req.postData() ?? "";
    const response = await route.fetch(swap ? { postData: postData.split(swap.from).join(swap.to) } : undefined);
    const raw = await response.body();
    await route.fulfill({ response, body: raw });
    resolve(raw.toString("utf8"));
  };
  await page.route("**/*", handler);
  try {
    await open();
    return await captured;
  } finally {
    await page.unroute("**/*", handler);
  }
}

type CanvasInfo = {
  width: number;
  height: number;
  black: number;
  nonBinary: number;
  blackInRect: (x0: number, y0: number, x1: number, y1: number) => number;
};

/** Piksele podglądu etykiety (canvas w oknie). */
async function readCanvas(page: Page): Promise<CanvasInfo & { raw: number[] }> {
  const canvas = labelDialog(page).locator("canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width), { message: "canvas narysowany" })
    .toBe(LABEL_W);
  const data = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    // 1 = czarny, 0 = biały, 2 = coś innego (szarość, przezroczystość)
    const bits: number[] = [];
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
      bits.push(a === 255 && r === 0 && g === 0 && b === 0 ? 1 : a === 255 && r === 255 && g === 255 && b === 255 ? 0 : 2);
    }
    return { width: c.width, height: c.height, bits };
  });
  const { width, height, bits } = data;
  const blackInRect = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (bits[y * width + x] === 1) n++;
    return n;
  };
  return {
    width,
    height,
    black: bits.filter((b) => b === 1).length,
    nonBinary: bits.filter((b) => b === 2).length,
    blackInRect,
    raw: bits,
  };
}

/** QR na etykiecie odpowiada modułom kodu dla qrUrl (ta sama metoda co w badge-label-canvas). */
function assertQrMatches(info: CanvasInfo & { raw: number[] }, qrUrl: string) {
  const qr = QRCode.create(qrUrl, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const scale = Math.floor(QR_BOX / count);
  const qrSize = count * scale;
  const qrX = LABEL_W - MARGIN - qrSize;
  const qrY = Math.round((LABEL_H - qrSize) / 2);
  let mismatches = 0;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const x = qrX + col * scale + Math.floor(scale / 2);
      const y = qrY + row * scale + Math.floor(scale / 2);
      const isBlack = info.raw[y * LABEL_W + x] === 1;
      if (isBlack !== Boolean(qr.modules.get(row, col))) mismatches++;
    }
  }
  expect(mismatches, "moduły QR na etykiecie zgodne z adresem wymiany kontaktów").toBe(0);
  return { qrX, qrY, qrSize };
}

function labelFrom(body: string) {
  const m = /"label":(\{[^}]*\})/.exec(body);
  if (!m) return null;
  return JSON.parse(m[1]) as { name: string; company: string | null; eventName: string; qrUrl: string };
}

/** Wspólne sprawdzenie podglądu: rozmiar B1, 1 bit, tekst po lewej, QR po prawej, nic poza polem tekstu. */
async function expectLabelPreview(page: Page, body: string, p: Person) {
  const label = labelFrom(body);
  expect(label, `etykieta w odpowiedzi akcji: ${body.slice(0, 300)}`).not.toBeNull();
  // Nazwa w podglądzie (aria-label canvas) pochodzi z odpowiedzi akcji zdekodowanej przez przeglądarkę.
  await expect(labelDialog(page).getByRole("img", { name: `Podgląd etykiety: ${fullName(p)}` })).toBeVisible();
  expect(label!.name).toBe(fullName(p));
  expect(label!.company).toBe(p.company);
  expect(label!.eventName).toBe(EVENT_NAME);
  expect(label!.qrUrl).toMatch(new RegExp(`^https?://[^/]+/e/${fixture!.slug}/connect/${p.contact_code}$`));
  const info = await readCanvas(page);
  expect(info.width).toBe(LABEL_W);
  expect(info.height).toBe(LABEL_H);
  expect(info.nonBinary, "podgląd jest czarno-biały (1 bit)").toBe(0);
  expect(info.black).toBeGreaterThan(500);

  const { qrX } = assertQrMatches(info, label!.qrUrl);
  // Tekst (imię, firma, nazwa wydarzenia) po lewej stronie QR.
  expect(info.blackInRect(MARGIN, MARGIN, qrX - QR_GAP, 60), "imię i nazwisko u góry").toBeGreaterThan(50);
  expect(info.blackInRect(MARGIN, LABEL_H - MARGIN - 24, qrX - QR_GAP, LABEL_H), "nazwa wydarzenia na dole").toBeGreaterThan(20);
  // Odstęp między tekstem a QR i lewy margines muszą zostać puste (tekst nie wychodzi poza pole).
  expect(info.blackInRect(qrX - QR_GAP + 2, 0, qrX, LABEL_H), "odstęp tekst–QR pusty").toBe(0);
  expect(info.blackInRect(0, 0, MARGIN - 4, LABEL_H), "lewy margines pusty").toBe(0);
  return { info, qrX };
}

test("logowanie organizatora (sesja dla testów druku identyfikatorów)", async ({ page }) => {
  const { organizerEmail } = state();
  await ensureFixture();
  await loginWithMagicLink(page, "/login", organizerEmail);
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: ORGANIZER_STATE });
});

test.describe("panel organizatora", () => {
  test.use({ storageState: ORGANIZER_STATE });

  test("przycisk „Drukuj identyfikator” przy każdej zatwierdzonej osobie, oczekujący poza listą", async ({ page }) => {
    const f = await ensureFixture();
    await page.goto(`/admin/events/${f.eventId}/reception`);
    for (const p of [f.short, f.polish, f.noSpaces, f.noCompany]) {
      await expect(receptionRow(page, fullName(p))).toBeVisible();
      await expect(printButton(page, p)).toBeVisible();
    }
    await expect(page.getByText(fullName(f.pending))).toHaveCount(0);
    await expect(page.getByText(fullName(f.otherEvent))).toHaveCount(0);
  });

  test("sterownik drukarki ładuje się dopiero po otwarciu okna (import dynamiczny)", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    await expect(printButton(page, f.short)).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => typeof (window as unknown as { Niimbot?: unknown }).Niimbot)).toBe("undefined");
    await printButton(page, f.short).click();
    await expect(labelDialog(page)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => typeof (window as unknown as { Niimbot?: { printImage?: unknown } }).Niimbot?.printImage))
      .toBe("function");
  });

  test("podgląd etykiety: imię, firma, nazwa wydarzenia i QR wymiany kontaktów; bez e-maila i tokenów", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    const body = await captureLabelAction(page, () => printButton(page, f.short).click());
    await expect(labelDialog(page).getByText("Etykieta 50 × 30 mm na drukarkę Niimbot B1 (Bluetooth).")).toBeVisible();
    await expectLabelPreview(page, body, f.short);

    // Akcja zwraca tylko to, czego potrzebuje etykieta.
    const { data: row } = await admin()
      .from("attendees")
      .select("email, qr_code_token, check_in_token")
      .eq("id", f.short.id)
      .single();
    expect(body).not.toContain(row!.email);
    expect(body).not.toContain(row!.qr_code_token);
    expect(body).not.toContain(row!.check_in_token);
    expect(body).not.toContain(f.receptionToken);
    expect(Object.keys(labelFrom(body)!).sort()).toEqual(["company", "eventName", "name", "qrUrl"]);
  });

  test("polskie znaki i bardzo długa firma: brak błędu, tekst mieści się w polu etykiety", async ({ page }) => {
    const f = await ensureFixture();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await stubBluetooth(page, "cancel");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    const body = await captureLabelAction(page, () => printButton(page, f.polish).click());
    const { info, qrX } = await expectLabelPreview(page, body, f.polish);
    // Firma jest pod imieniem (środek etykiety nie jest pusty).
    expect(info.blackInRect(MARGIN, 80, qrX - QR_GAP, 190)).toBeGreaterThan(30);
    expect(errors).toEqual([]);
  });

  test("bardzo długie nazwisko bez spacji: skrócenie z wielokropkiem, bez błędu", async ({ page }) => {
    const f = await ensureFixture();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await stubBluetooth(page, "cancel");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    const body = await captureLabelAction(page, () => printButton(page, f.noSpaces).click());
    await expectLabelPreview(page, body, f.noSpaces);
    expect(errors).toEqual([]);
  });

  test("osoba bez firmy: etykieta bez firmy", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    const body = await captureLabelAction(page, () => printButton(page, f.noCompany).click());
    const { info, qrX } = await expectLabelPreview(page, body, f.noCompany);
    expect(labelFrom(body)!.company).toBeNull();
    // Imię i nazwisko (najwyżej 2 wiersze po 38 px), bez firmy — pas nad nazwą wydarzenia pusty.
    expect(info.blackInRect(MARGIN, 115, qrX - QR_GAP, 200)).toBe(0);
  });

  test("anulowanie okna wyboru drukarki: bez komunikatu błędu; requestDevice z filtrem B1", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    await printButton(page, f.short).click();
    const dialog = labelDialog(page);
    await expect(dialog.locator("canvas")).toBeVisible();
    await expect(dialog.getByText(UNSUPPORTED)).toHaveCount(0);
    const print = dialog.getByRole("button", { name: "Drukuj", exact: true });
    await expect(print).toBeEnabled();
    await print.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __btCalls: unknown[] }).__btCalls.length))
      .toBe(1);
    await expect(print).toBeEnabled();
    await expect(dialog.getByRole("status")).toHaveCount(0);
    const calls = await page.evaluate(() => (window as unknown as { __btCalls: unknown[] }).__btCalls);
    expect(JSON.stringify(calls[0])).toContain('"namePrefix":"B1"');
  });

  test("brak drukarki / brak zgody / zerwane połączenie: czytelne komunikaty po polsku", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "notfound");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    await printButton(page, f.short).click();
    const dialog = labelDialog(page);
    await expect(dialog.locator("canvas")).toBeVisible();
    const print = dialog.getByRole("button", { name: "Drukuj", exact: true });

    await print.click();
    await expect(dialog.getByRole("status")).toHaveText(/Nie znaleziono drukarki\. Włącz B1 i Bluetooth/);
    await expect(print).toBeEnabled();

    await page.evaluate(() => ((window as unknown as { __btMode: string }).__btMode = "security"));
    await print.click();
    await expect(dialog.getByRole("status")).toHaveText(/Przeglądarka nie pozwoliła połączyć się z drukarką/);

    await page.evaluate(() => ((window as unknown as { __btMode: string }).__btMode = "gatt"));
    await print.click();
    await expect(dialog.getByRole("status")).toHaveText(/Połączenie z drukarką zostało przerwane/);
    await expect(print).toBeEnabled();

    await dialog.getByRole("button", { name: "Zamknij" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("przeglądarka bez Web Bluetooth: informacja po polsku, „Drukuj” nieaktywne, podgląd działa", async ({ page }) => {
    const f = await ensureFixture();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await stubBluetooth(page, "remove");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    expect(await page.evaluate(() => "bluetooth" in navigator)).toBe(false);
    await printButton(page, f.short).click();
    const dialog = labelDialog(page);
    await expect(dialog.getByText(UNSUPPORTED)).toBeVisible();
    await expect(dialog.locator("canvas")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Drukuj", exact: true })).toBeDisabled();
    // Bez wsparcia sterownik w ogóle się nie ładuje.
    expect(await page.evaluate(() => typeof (window as unknown as { Niimbot?: unknown }).Niimbot)).toBe("undefined");
    expect(errors).toEqual([]);
  });

  test("otwarcie podglądu i próba druku nie meldują osoby", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "notfound");
    await page.goto(`/admin/events/${f.eventId}/reception`);
    await printButton(page, f.noCompany).click();
    const dialog = labelDialog(page);
    await expect(dialog.locator("canvas")).toBeVisible();
    await dialog.getByRole("button", { name: "Drukuj", exact: true }).click();
    await expect(dialog.getByRole("status")).toBeVisible();
    await dialog.getByRole("button", { name: "Zamknij" }).click();
    const { data } = await admin().from("attendees").select("checked_in_at").eq("id", f.noCompany.id).single();
    expect(data!.checked_in_at).toBeNull();
    await expect(receptionRow(page, fullName(f.noCompany)).getByRole("button", { name: "Zamelduj" })).toBeVisible();
  });

  test("akcja organizatora odmawia dla osoby z innego wydarzenia i dla oczekującej", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/admin/events/${f.eventId}/reception`);

    let body = await captureLabelAction(page, () => printButton(page, f.short).click(), { from: f.short.id, to: f.otherEvent.id });
    await expect(labelDialog(page).getByText("Nie znaleziono uczestnika.")).toBeVisible();
    expect(body).not.toContain(f.otherEvent.contact_code);
    expect(body).not.toContain(f.otherEvent.last);
    await expect(labelDialog(page).locator("canvas")).toHaveCount(0);
    await expect(labelDialog(page).getByRole("button", { name: "Drukuj", exact: true })).toBeDisabled();
    await labelDialog(page).getByRole("button", { name: "Zamknij" }).click();

    body = await captureLabelAction(page, () => printButton(page, f.short).click(), { from: f.short.id, to: f.pending.id });
    await expect(labelDialog(page).getByText("Nie znaleziono uczestnika.")).toBeVisible();
    expect(body).not.toContain(f.pending.contact_code);
  });
});

test.describe("link obsługi recepcji (bez logowania)", () => {
  test.use(NO_SESSION);

  test("przycisk druku przy osobie i podgląd etykiety na /e/{slug}/recepcja/{token}", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/e/${f.slug}/recepcja/${f.receptionToken}`);
    for (const p of [f.short, f.polish, f.noSpaces, f.noCompany]) await expect(printButton(page, p)).toBeVisible();
    await expect(page.getByText(fullName(f.pending))).toHaveCount(0);
    const body = await captureLabelAction(page, () => printButton(page, f.polish).click());
    await expectLabelPreview(page, body, f.polish);
    const { data: row } = await admin().from("attendees").select("email, qr_code_token, check_in_token").eq("id", f.polish.id).single();
    expect(body).not.toContain(row!.email);
    expect(body).not.toContain(row!.qr_code_token);
    expect(body).not.toContain(row!.check_in_token);
  });

  test("akcja z linku obsługi odmawia dla osoby z innego wydarzenia i oczekującej", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/e/${f.slug}/recepcja/${f.receptionToken}`);

    let body = await captureLabelAction(page, () => printButton(page, f.short).click(), { from: f.short.id, to: f.otherEvent.id });
    await expect(labelDialog(page).getByText("Nie znaleziono uczestnika.")).toBeVisible();
    expect(body).not.toContain(f.otherEvent.contact_code);
    await labelDialog(page).getByRole("button", { name: "Zamknij" }).click();

    body = await captureLabelAction(page, () => printButton(page, f.short).click(), { from: f.short.id, to: f.pending.id });
    await expect(labelDialog(page).getByText("Nie znaleziono uczestnika.")).toBeVisible();
    expect(body).not.toContain(f.pending.contact_code);
  });

  test("odwołany link: otwarta strona dostaje odmowę akcji, nowe wejście pokazuje „Link nieaktywny”", async ({ page }) => {
    const f = await ensureFixture();
    await stubBluetooth(page, "cancel");
    await page.goto(`/e/${f.slug}/recepcja/${f.receptionToken}`);
    await expect(printButton(page, f.short)).toBeVisible();

    const db = admin();
    const newToken = `e2e16-nowy-${SUFFIX}-${Math.random().toString(36).slice(2)}`;
    await db.from("events").update({ reception_token: newToken }).eq("id", f.eventId);
    try {
      const body = await captureLabelAction(page, () => printButton(page, f.short).click());
      await expect(labelDialog(page).getByText("Link recepcji jest nieaktywny.")).toBeVisible();
      expect(body).not.toContain(f.short.contact_code);
      await expect(labelDialog(page).locator("canvas")).toHaveCount(0);

      await page.goto(`/e/${f.slug}/recepcja/${f.receptionToken}`);
      await expect(page.getByText("Link nieaktywny")).toBeVisible();
      await expect(page.getByRole("button", { name: /Drukuj identyfikator/ })).toHaveCount(0);

      // Wyłączony link (null) też nie działa.
      await db.from("events").update({ reception_token: null }).eq("id", f.eventId);
      await page.goto(`/e/${f.slug}/recepcja/${newToken}`);
      await expect(page.getByText("Link nieaktywny")).toBeVisible();
    } finally {
      await db.from("events").update({ reception_token: f.receptionToken }).eq("id", f.eventId);
    }
  });

  test("anonim bez tokenu nie otworzy panelu recepcji organizatora", async ({ page }) => {
    const f = await ensureFixture();
    await page.goto(`/admin/events/${f.eventId}/reception`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /Drukuj identyfikator/ })).toHaveCount(0);
  });
});
