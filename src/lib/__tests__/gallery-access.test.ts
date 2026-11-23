import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// Galeria — kontrola dostępu i limity (bez bazy: atrapa klienta service_role).
// Link fotografa unieważniony/przeterminowany = brak uploadu; cudzy event = brak dostępu;
// limity eventu/linku/budżetu; duplikat; fotograf nie przetworzy cudzego zdjęcia.

type Query = { table: string; op: string; filters: unknown[][]; payload?: unknown };
type Result = { data?: unknown; error?: unknown; count?: number };

const db = {
  tables: {} as Record<string, (q: Query) => Result>,
  rpc: vi.fn(),
  usage: vi.fn(),
  queries: [] as Query[],
  storage: {
    createSignedUploadUrl: vi.fn(),
    download: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
    createSignedUrls: vi.fn(),
    createSignedUrl: vi.fn(),
  },
};

function builder(table: string) {
  const q: Query = { table, op: "select", filters: [] };
  const run = () => {
    db.queries.push(q);
    // Jak PostgREST z .select() po update: domyślnie jeden zmieniony wiersz.
    return Promise.resolve({ data: q.op === "update" ? [{ id: "row-id" }] : null, error: null, ...(db.tables[table]?.(q) ?? {}) });
  };
  const b: Record<string, unknown> = {
    select: () => b,
    update: (p: unknown) => ((q.op = "update"), (q.payload = p), b),
    delete: () => ((q.op = "delete"), b),
    insert: (p: unknown) => ((q.op = "insert"), (q.payload = p), b),
    upsert: (p: unknown) => ((q.op = "upsert"), (q.payload = p), b),
    maybeSingle: run,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  };
  for (const m of ["eq", "in", "lt", "gte", "is", "not", "order", "limit"]) {
    b[m] = (...args: unknown[]) => (q.filters.push([m, ...args]), b);
  }
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: (name: string, args: unknown) => (name === "gallery_usage" ? db.usage(args) : db.rpc(name, args)),
    storage: { from: () => db.storage },
  }),
}));
const feature = { on: true };
vi.mock("@/lib/entitlements", () => ({
  hasFeature: async () => feature.on,
  featureGate: async () => (feature.on ? { ok: true } : { ok: false, message: "Funkcja niedostępna w planie." }),
}));
const processPhoto = vi.fn();
vi.mock("@/lib/gallery-image", () => ({
  PhotoProcessingError: class extends Error {},
  processPhoto: (...a: unknown[]) => processPhoto(...a),
}));
const own = { event: null as null | Record<string, unknown> };
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const gallery = await import("@/lib/gallery");
const photographer = await import("@/app/g/[token]/actions");
const organizer = await import("@/app/(organizer)/admin/events/[eventId]/gallery/actions");

const EVENT = "11111111-1111-4111-8111-111111111111";
const TOKEN = "22222222-2222-4222-8222-222222222222";
const LINK = "33333333-3333-4333-8333-333333333333";
const PHOTO = "44444444-4444-4444-8444-444444444444";
const HASH = "a".repeat(64);
const meta = { name: "a.jpg", type: "image/jpeg", size: 1000, hash: HASH };

const linkRow = (patch: Record<string, unknown> = {}) => ({
  id: LINK,
  event_id: EVENT,
  label: "Anna",
  token: TOKEN,
  expires_at: null,
  max_photos: null,
  revoked_at: null,
  created_at: "2026-10-01T00:00:00Z",
  events: { id: EVENT, organization_id: "org", name: "Next Stop", logo_url: null, status: "published", deleted_at: null },
  ...patch,
});
const link = (() => {
  const { events, ...l } = linkRow();
  void events;
  return l;
})();

beforeEach(() => {
  db.tables = {};
  db.queries = [];
  db.rpc.mockReset();
  db.usage.mockReset();
  db.usage.mockResolvedValue({ data: [{ event_count: 0, event_bytes: 0, total_bytes: 0 }], error: null });
  for (const fn of Object.values(db.storage)) fn.mockReset();
  db.storage.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "https://x/sign" }, error: null });
  db.storage.remove.mockResolvedValue({ data: [], error: null });
  processPhoto.mockReset();
  feature.on = true;
  own.event = { id: EVENT, organization_id: "org", name: "Next Stop", logo_url: null, timezone: "Europe/Warsaw" };
});

describe("link fotografa", () => {
  it("aktywny link → kontekst eventu", async () => {
    db.tables.gallery_upload_links = () => ({ data: linkRow() });
    const ctx = await gallery.resolveUploadLink(TOKEN);
    expect(ctx?.event.id).toBe(EVENT);
    expect(ctx?.link.id).toBe(LINK);
  });

  it.each([
    ["unieważniony", { revoked_at: "2026-10-20T00:00:00Z" }],
    ["przeterminowany", { expires_at: "2020-01-01T00:00:00Z" }],
    ["event zarchiwizowany", { events: { ...linkRow().events, status: "archived" } }],
    ["event usunięty", { events: { ...linkRow().events, deleted_at: "2026-10-01T00:00:00Z" } }],
  ])("%s → brak dostępu", async (_name, patch) => {
    db.tables.gallery_upload_links = () => ({ data: linkRow(patch) });
    expect(await gallery.resolveUploadLink(TOKEN)).toBeNull();
  });

  it("plan bez galerii albo zły token → brak dostępu", async () => {
    db.tables.gallery_upload_links = () => ({ data: linkRow() });
    feature.on = false;
    expect(await gallery.resolveUploadLink(TOKEN)).toBeNull();
    feature.on = true;
    expect(await gallery.resolveUploadLink("nie-uuid")).toBeNull();
  });

  it("unieważniony link: akcje fotografa nie rezerwują ani nie przetwarzają", async () => {
    db.tables.gallery_upload_links = () => ({ data: linkRow({ revoked_at: "2026-10-20T00:00:00Z" }) });
    expect(await photographer.photographerStartUpload(TOKEN, meta)).toEqual({ ok: false, error: "Link do wgrywania jest nieaktywny." });
    expect(await photographer.photographerFinalizeUpload(TOKEN, PHOTO)).toEqual({ ok: false, error: "Link do wgrywania jest nieaktywny." });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.storage.download).not.toHaveBeenCalled();
  });
});

describe("rezerwacja i limity", () => {
  const organizerActor = { kind: "organizer" as const, userId: "user-1" };

  it("ok → podpisany adres do wysłania oryginału", async () => {
    db.rpc.mockResolvedValue({ data: [{ photo_id: PHOTO, result: "ok" }], error: null });
    const res = await gallery.startPhotoUpload(EVENT, organizerActor, meta);
    expect(res).toEqual({ ok: true, photoId: PHOTO, signedUrl: "https://x/sign", contentType: "image/jpeg" });
    expect(db.rpc).toHaveBeenCalledWith("reserve_event_photo", expect.objectContaining({ p_max_per_event: 500, p_content_hash: HASH }));
    expect(db.storage.createSignedUploadUrl).toHaveBeenCalledWith(`${EVENT}/${PHOTO}/original.jpg`, { upsert: true });
  });

  it("zły format / rozmiar / skrót → odrzucone przed rezerwacją", async () => {
    expect((await gallery.startPhotoUpload(EVENT, organizerActor, { ...meta, name: "a.gif", type: "image/gif" })).ok).toBe(false);
    expect((await gallery.startPhotoUpload(EVENT, organizerActor, { ...meta, size: 16 * 1024 * 1024 })).ok).toBe(false);
    expect((await gallery.startPhotoUpload(EVENT, organizerActor, { ...meta, hash: "zly" })).ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["event_limit", "Osiągnięto limit 500 zdjęć dla wydarzenia."],
    ["link_limit", "Osiągnięto limit zdjęć dla tego linku."],
    ["link_invalid", "Link do wgrywania jest nieaktywny."],
  ])("wynik %s → komunikat", async (result, message) => {
    db.rpc.mockResolvedValue({ data: [{ photo_id: null, result }], error: null });
    expect(await gallery.startPhotoUpload(EVENT, organizerActor, meta)).toEqual({ ok: false, error: message });
    expect(db.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("duplikat → pominięte (bez wysyłki)", async () => {
    db.rpc.mockResolvedValue({ data: [{ photo_id: null, result: "duplicate" }], error: null });
    expect(await gallery.startPhotoUpload(EVENT, organizerActor, meta)).toEqual({
      ok: false,
      error: "Pominięto — to zdjęcie jest już w galerii.",
      skipped: true,
    });
  });

  it("budżet wyczerpany → blokada bez rezerwacji", async () => {
    vi.stubEnv("GALLERY_STORAGE_BUDGET_MB", "1");
    db.usage.mockResolvedValue({ data: [{ event_count: 0, event_bytes: 0, total_bytes: 2 * 1024 * 1024 }], error: null });
    const res = await gallery.startPhotoUpload(EVENT, organizerActor, meta);
    vi.unstubAllEnvs();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Brak miejsca/);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("limit zapytań na link fotografa", async () => {
    db.tables.event_photos = (q) => (q.filters.some((f) => f[0] === "gte") ? { count: 120 } : { data: [] });
    const res = await gallery.startPhotoUpload(EVENT, { kind: "link", link }, meta);
    expect(res).toEqual({ ok: false, error: "Zbyt wiele zdjęć naraz. Odczekaj kilka minut i spróbuj ponownie." });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("licznik i budżet galerii", () => {
  it("agregacja w bazie (bez limitu 1000 wierszy) — wartości z RPC", async () => {
    vi.stubEnv("GALLERY_STORAGE_BUDGET_MB", "100");
    db.usage.mockResolvedValue({
      data: [{ event_count: "1500", event_bytes: "3000000000", total_bytes: String(50 * 1024 * 1024) }],
      error: null,
    });
    const usage = await gallery.getGalleryUsage(EVENT);
    vi.unstubAllEnvs();
    expect(usage.count).toBe(1500);
    expect(usage.eventBytes).toBe(3_000_000_000);
    expect(usage.budget.usedBytes).toBe(50 * 1024 * 1024);
    expect(usage.budget.blocked).toBe(false);
    // Licznik nie pobiera wierszy zdjęć do aplikacji.
    expect(db.queries.filter((q) => q.table === "event_photos")).toHaveLength(0);
  });

  it("porzucone rezerwacje (starsze niż 1 h) nie liczą się do budżetu", async () => {
    const before = Date.now();
    await gallery.getGalleryUsage(EVENT);
    const args = db.usage.mock.calls[0][0] as { p_event_id: string; p_stale_before: string };
    expect(args.p_event_id).toBe(EVENT);
    const cutoff = new Date(args.p_stale_before).getTime();
    expect(before - cutoff).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    expect(before - cutoff).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });

  it("błąd odczytu licznika → upload zablokowany (bez rezerwacji)", async () => {
    db.usage.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await gallery.startPhotoUpload(EVENT, { kind: "organizer", userId: "user-1" }, meta);
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("sprzątanie porzuconych rezerwacji obejmuje wszystkie wydarzenia (wspólny budżet)", async () => {
    db.tables.event_photos = (q) =>
      q.op === "select" && q.filters.some((f) => f[0] === "lt")
        ? { data: [{ id: "stale-1", original_path: `inny-event/stale-1/original.jpg` }] }
        : {};
    db.rpc.mockResolvedValue({ data: [{ photo_id: PHOTO, result: "ok" }], error: null });
    await gallery.startPhotoUpload(EVENT, { kind: "organizer", userId: "user-1" }, meta);
    const sweep = db.queries.find((q) => q.table === "event_photos" && q.op === "select" && q.filters.some((f) => f[0] === "lt"));
    expect(sweep?.filters).toContainEqual(["eq", "status", "uploading"]);
    expect(sweep?.filters.some((f) => f[0] === "eq" && f[1] === "event_id")).toBe(false);
    expect(sweep?.filters.some((f) => f[0] === "limit")).toBe(true);
    expect(db.storage.remove).toHaveBeenCalledWith([`inny-event/stale-1/original.jpg`]);
    const del = db.queries.find((q) => q.table === "event_photos" && q.op === "delete");
    expect(del?.filters).toContainEqual(["in", "id", ["stale-1"]]);
  });
});

describe("przetworzenie", () => {
  const event = { id: EVENT, organization_id: "org", name: "Next Stop", logo_url: null };
  const photoRow = (patch: Record<string, unknown> = {}) => ({
    id: PHOTO,
    event_id: EVENT,
    status: "uploading",
    original_path: `${EVENT}/${PHOTO}/original.jpg`,
    content_hash: createHash("sha256").update(Buffer.from("plik")).digest("hex"),
    upload_link_id: null,
    uploaded_by: "user-1",
    ...patch,
  });

  it("fotograf nie przetworzy zdjęcia z innego linku", async () => {
    db.tables.event_photos = () => ({ data: photoRow({ upload_link_id: "inny-link" }) });
    expect(await gallery.finalizePhotoUpload(event, PHOTO, { kind: "link", link })).toEqual({ ok: false, error: "Zdjęcie nie istnieje." });
    expect(db.storage.download).not.toHaveBeenCalled();
  });

  it("plik inny niż zadeklarowany (skrót) → failed, oryginał usunięty", async () => {
    db.tables.event_photos = (q) => (q.op === "select" ? { data: photoRow() } : {});
    db.storage.download.mockResolvedValue({ data: new Blob([Buffer.from("inny plik")]), error: null });
    const res = await gallery.finalizePhotoUpload(event, PHOTO, { kind: "organizer", userId: "user-1" });
    expect(res.ok).toBe(false);
    expect(db.storage.remove).toHaveBeenCalledWith([`${EVENT}/${PHOTO}/original.jpg`]);
    expect(db.queries.find((q) => q.op === "update")?.payload).toMatchObject({ status: "failed", original_path: null });
    expect(processPhoto).not.toHaveBeenCalled();
  });

  it("znak wodny wyłączony w ustawieniach → przetwarzanie bez znaku; oryginał usunięty po zapisie", async () => {
    db.tables.event_photos = (q) => (q.op === "select" ? { data: photoRow() } : {});
    db.tables.event_gallery_settings = () => ({ data: { enabled: true, watermark_enabled: false, info_text: null, published_at: null } });
    db.storage.download.mockResolvedValue({ data: new Blob([Buffer.from("plik")]), error: null });
    db.storage.upload.mockResolvedValue({ data: {}, error: null });
    processPhoto.mockResolvedValue({ display: Buffer.from("d"), thumb: Buffer.from("t"), width: 10, height: 10, watermarked: false });

    expect(await gallery.finalizePhotoUpload(event, PHOTO, { kind: "organizer", userId: "user-1" })).toEqual({ ok: true });
    expect(processPhoto).toHaveBeenCalledWith(expect.any(Buffer), { watermark: false, logo: null });
    expect(db.queries.find((q) => q.op === "update")?.payload).toMatchObject({ status: "ready", original_path: null, size_bytes: 2 });
    expect(db.storage.remove).toHaveBeenLastCalledWith([`${EVENT}/${PHOTO}/original.jpg`]);
  });
});

describe("rezerwacja w toku a sprzątanie porzuconych", () => {
  const organizerActor = { kind: "organizer" as const, userId: "user-1" };
  const event = { id: EVENT, organization_id: "org", name: "Next Stop", logo_url: null };
  const uploadUpdate = () => db.queries.find((q) => q.table === "event_photos" && q.op === "update");

  it("wznowienie przerwanej wysyłki odświeża created_at (sprzątanie nie usunie wiersza)", async () => {
    db.rpc.mockResolvedValue({ data: [{ photo_id: null, result: "duplicate" }], error: null });
    db.tables.event_photos = (q) =>
      q.op === "select" && q.filters.some((f) => f[0] === "eq" && f[1] === "content_hash") ? { data: { id: PHOTO } } : {};
    const before = Date.now();
    const res = await gallery.startPhotoUpload(EVENT, organizerActor, meta);
    expect(res.ok).toBe(true);
    const up = uploadUpdate();
    const payload = up?.payload as { created_at?: string };
    expect(new Date(payload.created_at ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(up?.filters).toContainEqual(["eq", "status", "uploading"]);
  });

  it("nowa rezerwacja nie nadpisuje created_at", async () => {
    db.rpc.mockResolvedValue({ data: [{ photo_id: PHOTO, result: "ok" }], error: null });
    await gallery.startPhotoUpload(EVENT, organizerActor, meta);
    expect(uploadUpdate()?.payload).not.toHaveProperty("created_at");
  });

  it("rezerwacja zniknęła przed wydaniem adresu → błąd, bez podpisanego adresu", async () => {
    db.rpc.mockResolvedValue({ data: [{ photo_id: PHOTO, result: "ok" }], error: null });
    db.tables.event_photos = (q) => (q.op === "update" ? { data: [] } : {});
    const res = await gallery.startPhotoUpload(EVENT, organizerActor, meta);
    expect(res.ok).toBe(false);
    expect(db.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("sprzątanie usuwa tylko wiersze wciąż w toku i nadal przeterminowane", async () => {
    db.tables.event_photos = (q) =>
      q.op === "select" && q.filters.some((f) => f[0] === "lt") ? { data: [{ id: "stale-1", original_path: null }] } : {};
    await gallery.sweepStaleUploads();
    const del = db.queries.find((q) => q.table === "event_photos" && q.op === "delete");
    expect(del?.filters).toContainEqual(["eq", "status", "uploading"]);
    expect(del?.filters.some((f) => f[0] === "lt" && f[1] === "created_at")).toBe(true);
  });

  it("finalizacja wiersza usuniętego w trakcie → błąd i sprzątnięte pliki", async () => {
    const original = `${EVENT}/${PHOTO}/original.jpg`;
    db.tables.event_photos = (q) =>
      q.op === "select"
        ? {
            data: {
              id: PHOTO,
              event_id: EVENT,
              status: "uploading",
              original_path: original,
              content_hash: createHash("sha256").update(Buffer.from("plik")).digest("hex"),
              upload_link_id: null,
              uploaded_by: "user-1",
            },
          }
        : { data: [] };
    db.storage.download.mockResolvedValue({ data: new Blob([Buffer.from("plik")]), error: null });
    db.storage.upload.mockResolvedValue({ data: {}, error: null });
    processPhoto.mockResolvedValue({ display: Buffer.from("d"), thumb: Buffer.from("t"), width: 10, height: 10, watermarked: false });

    const res = await gallery.finalizePhotoUpload(event, PHOTO, organizerActor);
    expect(res.ok).toBe(false);
    expect(uploadUpdate()?.filters).toContainEqual(["eq", "status", "uploading"]);
    expect(db.storage.remove).toHaveBeenLastCalledWith([`${EVENT}/${PHOTO}/display.jpg`, `${EVENT}/${PHOTO}/thumb.jpg`, original]);
  });
});

describe("panel organizatora — tylko właściciel eventu", () => {
  it("cudzy event (getOwnEvent = null) → brak dostępu we wszystkich akcjach", async () => {
    own.event = null;
    const denied = "Brak dostępu do wydarzenia.";
    expect(await organizer.startGalleryUpload(EVENT, meta)).toEqual({ ok: false, error: denied });
    expect(await organizer.finalizeGalleryUpload(EVENT, PHOTO)).toEqual({ ok: false, error: denied });
    expect(await organizer.deleteGalleryPhotos(EVENT, [PHOTO])).toEqual({ status: "error", message: denied });
    expect(await organizer.setGalleryPhotosHidden(EVENT, [PHOTO], true)).toEqual({ status: "error", message: denied });
    expect(await organizer.revokeGalleryUploadLink(EVENT, LINK)).toEqual({ status: "error", message: denied });
    expect(await organizer.setGalleryPublished(EVENT, true)).toEqual({ status: "error", message: denied });
    expect(db.queries).toHaveLength(0);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("usuwanie tylko w obrębie eventu: pliki i wiersze", async () => {
    db.tables.event_photos = (q) =>
      q.op === "select"
        ? { data: [{ id: PHOTO, original_path: null, display_path: "p/d.jpg", thumb_path: "p/t.jpg" }] }
        : {};
    expect(await organizer.deleteGalleryPhotos(EVENT, [PHOTO, "nie-uuid"])).toEqual({ status: "success" });
    expect(db.storage.remove).toHaveBeenCalledWith(["p/d.jpg", "p/t.jpg"]);
    const del = db.queries.find((q) => q.op === "delete");
    expect(del?.filters).toContainEqual(["eq", "event_id", EVENT]);
  });
});

describe("adresy plików", () => {
  it("miniatury tylko przez podpisane adresy z krótką ważnością (15 min), nigdy publiczne", async () => {
    db.tables.event_photos = () => ({
      data: [{ id: PHOTO, status: "ready", hidden: false, width: 1, height: 1, size_bytes: 5, watermarked: true, upload_link_id: null, created_at: "x", thumb_path: "p/t.jpg" }],
    });
    db.storage.createSignedUrls.mockResolvedValue({ data: [{ path: "p/t.jpg", signedUrl: "https://x/signed?token=t" }], error: null });
    const photos = await gallery.listOrganizerPhotos(EVENT);
    expect(db.storage.createSignedUrls).toHaveBeenCalledWith(["p/t.jpg"], 900);
    expect(photos[0].thumb_url).toBe("https://x/signed?token=t");
  });
});

describe("podgląd powiększony (organizator)", () => {
  it("wersja display przez podpisany adres 15 min, tylko gotowe zdjęcie z tego eventu", async () => {
    db.tables.event_photos = () => ({ data: { display_path: `${EVENT}/${PHOTO}/display.jpg` } });
    db.storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/display?token=t" }, error: null });
    expect(await organizer.getGalleryPhotoPreview(EVENT, PHOTO)).toEqual({ ok: true, url: "https://x/display?token=t" });
    expect(db.storage.createSignedUrl).toHaveBeenCalledWith(`${EVENT}/${PHOTO}/display.jpg`, 900);
    const q = db.queries.find((x) => x.table === "event_photos");
    expect(q?.filters).toEqual(expect.arrayContaining([["eq", "event_id", EVENT], ["eq", "status", "ready"]]));
  });

  it("zdjęcie nieprzetworzone / spoza eventu → bez adresu", async () => {
    db.tables.event_photos = () => ({ data: null });
    expect(await organizer.getGalleryPhotoPreview(EVENT, PHOTO)).toEqual({ ok: false, error: "Nie udało się wczytać zdjęcia." });
    expect(db.storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("cudzy event → brak dostępu", async () => {
    own.event = null;
    expect(await organizer.getGalleryPhotoPreview(EVENT, PHOTO)).toEqual({ ok: false, error: "Brak dostępu do wydarzenia." });
    expect(db.queries).toHaveLength(0);
  });
});
