import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Galeria — widok uczestnika i zgłoszenia (bez bazy: atrapa klienta service_role).
// Dostęp tylko po check-inie i publikacji, tylko do zdjęć własnego eventu; „To ja” tylko dla
// siebie; zgłoszenie od razu ukrywa zdjęcie; jedno zgłoszenie na parę zdjęcie + uczestnik;
// podpisane adresy 15 min / 60 s; bez logowania treści zgłoszeń i adresów.

type Query = { table: string; op: string; filters: unknown[][]; payload?: unknown; opts?: unknown };
type Result = { data?: unknown; error?: unknown; count?: number };

const db = {
  tables: {} as Record<string, (q: Query) => Result>,
  queries: [] as Query[],
  storage: { createSignedUrl: vi.fn(), createSignedUrls: vi.fn(), remove: vi.fn() },
};

function builder(table: string) {
  const q: Query = { table, op: "select", filters: [] };
  const run = () => {
    db.queries.push(q);
    return Promise.resolve({ data: null, error: null, ...(db.tables[table]?.(q) ?? {}) });
  };
  const b: Record<string, unknown> = {
    select: (_cols?: unknown, opts?: unknown) => ((q.opts = opts), b),
    update: (p: unknown) => ((q.op = "update"), (q.payload = p), b),
    delete: () => ((q.op = "delete"), b),
    insert: (p: unknown) => ((q.op = "insert"), (q.payload = p), b),
    upsert: (p: unknown, opts?: unknown) => ((q.op = "upsert"), (q.payload = p), (q.opts = opts), b),
    maybeSingle: run,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  };
  for (const m of ["eq", "in", "lt", "gte", "is", "not", "order"]) {
    b[m] = (...args: unknown[]) => (q.filters.push([m, ...args]), b);
  }
  return b;
}

/** Wartość filtra .eq(kolumna, wartość) w zapytaniu. */
const eqv = (q: Query, col: string) => q.filters.find((f) => f[0] === "eq" && f[1] === col)?.[2];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: vi.fn(),
    storage: { from: () => db.storage },
  }),
}));
const feature = { on: true };
vi.mock("@/lib/entitlements", () => ({
  hasFeature: async () => feature.on,
  featureGate: async () => (feature.on ? { ok: true } : { ok: false, message: "Funkcja niedostępna w planie." }),
}));
vi.mock("@/lib/gallery-image", () => ({ PhotoProcessingError: class extends Error {}, processPhoto: vi.fn() }));
const session = { attendee: null as null | Record<string, unknown>, event: null as null | Record<string, unknown> };
const own = { event: null as null | Record<string, unknown> };
vi.mock("@/lib/attendee-session", () => ({ getCurrentAttendee: async () => session.attendee }));
vi.mock("@/lib/events", () => ({
  getEventBySlugForRegistration: async () => session.event,
  getOwnEvent: async () => own.event,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const lib = await import("@/lib/gallery-participant");
const participant = await import("@/app/(participant)/e/[slug]/zdjecia/actions");
const organizer = await import("@/app/(organizer)/admin/events/[eventId]/gallery/actions");

const EVENT_A = "11111111-1111-4111-8111-111111111111";
const EVENT_B = "55555555-5555-4555-8555-555555555555";
const ATT_A = "66666666-6666-4666-8666-666666666666";
const ATT_B = "77777777-7777-4777-8777-777777777777";
const P1 = "44444444-4444-4444-8444-444444444441";
const P2 = "44444444-4444-4444-8444-444444444442";
const P3 = "44444444-4444-4444-8444-444444444443";
const REPORT = "88888888-8888-4888-8888-888888888888";

const eventA = { id: EVENT_A, organization_id: "org", name: "Next Stop Łódź", slug: "next-stop-lodz" };
const eventB = { id: EVENT_B, organization_id: "org", name: "Inny event", slug: "inny" };
const attendee = (patch: Record<string, unknown> = {}) => ({
  id: ATT_A,
  event_id: EVENT_A,
  status: "approved",
  checked_in_at: "2026-10-20T10:00:00Z",
  first_name: "Ola",
  last_name: "Nowak",
  ...patch,
});

const publishedSettings = { enabled: true, watermark_enabled: true, info_text: null, published_at: "2026-10-21T00:00:00Z" };

type Photo = { id: string; event_id: string; status: string; hidden: boolean; display_path: string; thumb_path: string };
const photo = (id: string, patch: Partial<Photo> = {}): Photo => ({
  id,
  event_id: EVENT_A,
  status: "ready",
  hidden: false,
  display_path: `${EVENT_A}/${id}/display.jpg`,
  thumb_path: `${EVENT_A}/${id}/thumb.jpg`,
  ...patch,
});

type Report = { id: string; event_id: string; photo_id: string | null; attendee_id: string; status: string };

/** Mała „baza”: zdjęcia, zgłoszenia, oznaczenia — tabele odpowiadają zgodnie z filtrami. */
function seed(opts: { settings?: unknown; photos?: Photo[]; reports?: Report[]; tags?: { photo_id: string; attendee_id: string }[] } = {}) {
  const photos = opts.photos ?? [photo(P1), photo(P2), photo(P3)];
  const reports = opts.reports ?? [];
  const tags = opts.tags ?? [];
  db.tables.event_gallery_settings = () => ({ data: opts.settings === undefined ? publishedSettings : opts.settings });
  db.tables.event_photos = (q) => {
    if (q.op !== "select") return {};
    let rows = photos.filter((p) => p.event_id === eqv(q, "event_id"));
    const id = eqv(q, "id");
    if (id) rows = rows.filter((p) => p.id === id);
    const inIds = q.filters.find((f) => f[0] === "in" && f[1] === "id")?.[2] as string[] | undefined;
    if (inIds) rows = rows.filter((p) => inIds.includes(p.id));
    if (eqv(q, "status")) rows = rows.filter((p) => p.status === eqv(q, "status"));
    if (eqv(q, "hidden") === false) rows = rows.filter((p) => !p.hidden);
    return { data: id ? rows[0] ?? null : rows };
  };
  db.tables.event_photo_reports = (q) => {
    if (q.op !== "select") return {};
    let rows = reports;
    for (const col of ["event_id", "photo_id", "attendee_id", "status", "id"]) {
      const v = eqv(q, col);
      if (v !== undefined) rows = rows.filter((r) => r[col as keyof Report] === v);
    }
    if ((q.opts as { head?: boolean } | undefined)?.head) return { count: rows.length };
    return { data: eqv(q, "id") ? rows[0] ?? null : rows };
  };
  db.tables.event_photo_tags = (q) => {
    if (q.op !== "select") return {};
    return { data: tags.filter((t) => t.attendee_id === eqv(q, "attendee_id")) };
  };
}

const inserts = (table: string) => db.queries.filter((q) => q.table === table && q.op === "insert");

beforeEach(() => {
  db.tables = {};
  db.queries = [];
  for (const fn of Object.values(db.storage)) fn.mockReset();
  db.storage.createSignedUrl.mockImplementation(async (path: string, ttl: number) => ({
    data: { signedUrl: `https://storage.test/sign/${path}?ttl=${ttl}&token=SECRET` },
    error: null,
  }));
  db.storage.createSignedUrls.mockImplementation(async (paths: string[], ttl: number) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `https://storage.test/sign/${p}?ttl=${ttl}&token=SECRET` })),
    error: null,
  }));
  db.storage.remove.mockResolvedValue({ data: [], error: null });
  feature.on = true;
  session.attendee = attendee();
  session.event = eventA;
  own.event = { ...eventA, timezone: "Europe/Warsaw" };
});

describe("dostęp do galerii", () => {
  it("check-in + publikacja → galeria otwarta", async () => {
    seed();
    expect((await lib.resolveParticipantGallery("next-stop-lodz")).state).toBe("open");
  });

  it("bez sesji uczestnika → no_session", async () => {
    session.attendee = null;
    expect((await lib.resolveParticipantGallery("next-stop-lodz")).state).toBe("no_session");
  });

  it("bez check-inu → komunikat, żadnych zdjęć ani adresów", async () => {
    seed();
    session.attendee = attendee({ checked_in_at: null });
    expect((await lib.resolveParticipantGallery("next-stop-lodz")).state).toBe("not_checked_in");
    expect(await participant.loadParticipantPhotos("next-stop-lodz", {})).toMatchObject({ ok: false });
    expect(await participant.getParticipantPhotoView("next-stop-lodz", P1)).toBeNull();
    expect(await participant.getParticipantPhotoDownload("next-stop-lodz", P1)).toBeNull();
    expect(db.storage.createSignedUrl).not.toHaveBeenCalled();
    expect(db.storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it("nieopublikowana → „pojawi się wkrótce”, bez zdjęć", async () => {
    seed({ settings: { ...publishedSettings, published_at: null } });
    expect((await lib.resolveParticipantGallery("next-stop-lodz")).state).toBe("coming_soon");
    expect(await participant.loadParticipantPhotos("next-stop-lodz", {})).toMatchObject({ ok: false });
  });

  it("galeria wyłączona albo plan bez funkcji → unavailable (404)", async () => {
    seed({ settings: { ...publishedSettings, enabled: false } });
    expect((await lib.resolveParticipantGallery("next-stop-lodz")).state).toBe("unavailable");
    seed();
    feature.on = false;
    expect((await lib.resolveParticipantGallery("next-stop-lodz")).state).toBe("unavailable");
  });

  it("uczestnik z check-inem z INNEGO wydarzenia nie widzi zdjęć tego wydarzenia", async () => {
    seed();
    const fromB = attendee({ id: ATT_B, event_id: EVENT_B });
    // Kontekst eventu A dla uczestnika eventu B — brak dostępu.
    expect((await lib.galleryContextFor(eventA as never, fromB as never)).state).toBe("unavailable");
    expect(await lib.canSeeGallery(eventA as never, fromB as never)).toBe(false);

    // Sesja uczestnika B na stronie eventu B: zdjęcia eventu A są niedostępne po identyfikatorze.
    session.attendee = fromB;
    session.event = eventB;
    const res = await participant.loadParticipantPhotos("inny", {});
    expect(res.ok && res.page.total).toBe(0);
    expect(await participant.getParticipantPhotoView("inny", P1)).toBeNull();
    expect(await participant.getParticipantPhotoDownload("inny", P1)).toBeNull();
    expect(await participant.toggleParticipantPhotoTag("inny", P1, true)).toBe(false);
    expect(await participant.reportParticipantPhoto("inny", P1, "remove_me", "")).toMatchObject({ ok: false });
    expect(db.storage.createSignedUrl).not.toHaveBeenCalled();
    expect(inserts("event_photo_reports")).toHaveLength(0);
    expect(db.queries.filter((q) => q.table === "event_photo_tags" && q.op === "upsert")).toHaveLength(0);
  });

  it("pozycja „Zdjęcia” w menu tylko po check-inie i publikacji", async () => {
    seed();
    expect(await lib.canSeeGallery(eventA as never, attendee() as never)).toBe(true);
    expect(await lib.canSeeGallery(eventA as never, attendee({ checked_in_at: null }) as never)).toBe(false);
    expect(await lib.canSeeGallery(null, attendee() as never)).toBe(false);
    seed({ settings: { ...publishedSettings, published_at: null } });
    expect(await lib.canSeeGallery(eventA as never, attendee() as never)).toBe(false);
  });
});

describe("siatka i adresy podpisane", () => {
  it("ukryte i zgłoszone (otwarte zgłoszenie) zdjęcia nie są widoczne", async () => {
    seed({
      photos: [photo(P1), photo(P2, { hidden: true }), photo(P3)],
      reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P3, attendee_id: ATT_B, status: "pending" }],
    });
    const page = await lib.listParticipantPhotos(EVENT_A, ATT_A);
    expect(page.photos.map((p) => p.id)).toEqual([P1]);
    expect(page.total).toBe(1);
    expect(page.photos[0].thumbUrl).toContain("ttl=900");
  });

  it("zgłoszone zdjęcie znika też zgłaszającemu, także z „Moje zdjęcia”", async () => {
    seed({
      tags: [{ photo_id: P1, attendee_id: ATT_A }, { photo_id: P2, attendee_id: ATT_A }],
      reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P2, attendee_id: ATT_A, status: "pending" }],
    });
    const mine = await lib.listParticipantPhotos(EVENT_A, ATT_A, { mine: true });
    expect(mine.photos.map((p) => p.id)).toEqual([P1]);
    expect(mine.mineTotal).toBe(1);
    expect(await lib.getParticipantPhotoUrl(EVENT_A, P2, "view")).toBeNull();
    expect(await lib.getParticipantPhotoUrl(EVENT_A, P2, "download", "x.jpg")).toBeNull();
    expect(db.storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("po „Zostaw” zdjęcie wraca, ale zgłaszający nie może go zgłosić ponownie", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_A, status: "kept" }] });
    const page = await lib.listParticipantPhotos(EVENT_A, ATT_A);
    expect(page.photos.find((p) => p.id === P1)).toMatchObject({ reportable: false });
    expect(page.photos.find((p) => p.id === P2)).toMatchObject({ reportable: true });
  });

  it("podgląd: wersja display, 15 min; pobranie: 60 s z nazwą pliku", async () => {
    seed();
    await participant.getParticipantPhotoView("next-stop-lodz", P1);
    expect(db.storage.createSignedUrl).toHaveBeenLastCalledWith(`${EVENT_A}/${P1}/display.jpg`, 900);
    await participant.getParticipantPhotoDownload("next-stop-lodz", P1);
    expect(db.storage.createSignedUrl).toHaveBeenLastCalledWith(`${EVENT_A}/${P1}/display.jpg`, 60, {
      download: "next-stop-lodz-zdjecie-44444444.jpg",
    });
  });

  it("ukryte przez organizatora → brak nowego adresu", async () => {
    seed({ photos: [photo(P1, { hidden: true })] });
    expect(await participant.getParticipantPhotoView("next-stop-lodz", P1)).toBeNull();
    expect(db.storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("stronicowanie po 48", async () => {
    const many = Array.from({ length: 50 }, (_, i) => photo(`44444444-4444-4444-8444-${String(i).padStart(12, "0")}`));
    seed({ photos: many });
    const first = await lib.listParticipantPhotos(EVENT_A, ATT_A);
    expect(first.photos).toHaveLength(48);
    expect(first.nextOffset).toBe(48);
    const second = await lib.listParticipantPhotos(EVENT_A, ATT_A, { offset: 48 });
    expect(second.photos).toHaveLength(2);
    expect(second.nextOffset).toBeNull();
  });
});

describe("„To ja”", () => {
  it("oznaczenie zawsze dla uczestnika z sesji", async () => {
    seed();
    expect(await participant.toggleParticipantPhotoTag("next-stop-lodz", P1, true)).toBe(true);
    const up = db.queries.find((q) => q.table === "event_photo_tags" && q.op === "upsert");
    expect(up?.payload).toEqual({ photo_id: P1, attendee_id: ATT_A });
  });

  it("zdjęcie zgłoszone/ukryte nie da się oznaczyć", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_B, status: "pending" }] });
    expect(await participant.toggleParticipantPhotoTag("next-stop-lodz", P1, true)).toBe(false);
  });

  it("zdjęcie innego uczestnika: zdjęcie oznaczone przez kogoś innego nie jest „moje”", async () => {
    seed({ tags: [{ photo_id: P1, attendee_id: ATT_B }] });
    const page = await lib.listParticipantPhotos(EVENT_A, ATT_A);
    expect(page.photos.find((p) => p.id === P1)?.mine).toBe(false);
    expect(page.mineTotal).toBe(0);
  });
});

describe("zgłoszenia — uczestnik", () => {
  it("zgłoszenie zapisuje rekord z uczestnikiem z sesji", async () => {
    seed();
    const res = await participant.reportParticipantPhoto("next-stop-lodz", P1, "remove_me", "  proszę usunąć ");
    expect(res).toEqual({ ok: true, message: expect.stringMatching(/ukryte do decyzji organizatora/) });
    expect(inserts("event_photo_reports")[0].payload).toEqual({
      event_id: EVENT_A,
      photo_id: P1,
      attendee_id: ATT_A,
      kind: "remove_me",
      message: "proszę usunąć",
    });
  });

  it("drugie zgłoszenie tej samej pary (otwarte) → „już zgłoszone”, bez nowego rekordu", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_A, status: "pending" }] });
    const res = await lib.reportPhoto(EVENT_A, ATT_A, P1, "remove_me", "");
    expect(res).toMatchObject({ ok: true, message: expect.stringMatching(/już zgłoszone/) });
    expect(inserts("event_photo_reports")).toHaveLength(0);
  });

  it("po decyzji „Zostaw” ta sama osoba nie zgłosi zdjęcia ponownie", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_A, status: "kept" }] });
    const res = await lib.reportPhoto(EVENT_A, ATT_A, P1, "other", "jednak nie");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/zdecydował, że zostaje/) });
    expect(inserts("event_photo_reports")).toHaveLength(0);
  });

  it("inna osoba może zgłosić zdjęcie zostawione po czyimś zgłoszeniu", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_B, status: "kept" }] });
    expect(await lib.reportPhoto(EVENT_A, ATT_A, P1, "remove_me", "")).toMatchObject({ ok: true });
    expect(inserts("event_photo_reports")).toHaveLength(1);
  });

  it("wyścig (unikalny indeks 23505) → „już zgłoszone”", async () => {
    seed();
    const base = db.tables.event_photo_reports;
    db.tables.event_photo_reports = (q) => (q.op === "insert" ? { error: { code: "23505" } } : base(q));
    expect(await lib.reportPhoto(EVENT_A, ATT_A, P1, "remove_me", "")).toMatchObject({ ok: true, message: expect.stringMatching(/już zgłoszone/) });
  });

  it("walidacja: zły powód, za długa wiadomość, „Inny powód” bez opisu", async () => {
    seed();
    expect(await lib.reportPhoto(EVENT_A, ATT_A, P1, "spam", "")).toMatchObject({ ok: false });
    expect(await lib.reportPhoto(EVENT_A, ATT_A, P1, "remove_me", "x".repeat(501))).toMatchObject({ ok: false });
    expect(await lib.reportPhoto(EVENT_A, ATT_A, P1, "other", "  ")).toMatchObject({ ok: false });
    expect(inserts("event_photo_reports")).toHaveLength(0);
  });

  it("limit 20 zgłoszeń na dobę", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`,
      event_id: EVENT_A,
      photo_id: `other-${i}`,
      attendee_id: ATT_A,
      status: "pending",
    }));
    seed({ reports: many });
    expect(await lib.reportPhoto(EVENT_A, ATT_A, P1, "remove_me", "")).toMatchObject({ ok: false, error: expect.stringMatching(/limit/) });
    expect(inserts("event_photo_reports")).toHaveLength(0);
  });
});

describe("zgłoszenia — organizator", () => {
  it("„Zostaw” → status kept, zdjęcie zostaje", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_A, status: "pending" }] });
    const res = await organizer.resolveGalleryReport(EVENT_A, REPORT, "keep");
    expect(res.status).toBe("success");
    const upd = db.queries.find((q) => q.table === "event_photo_reports" && q.op === "update");
    expect(upd?.payload).toMatchObject({ status: "kept" });
    expect(db.queries.some((q) => q.table === "event_photos" && q.op === "delete")).toBe(false);
  });

  it("„Usuń” → otwarte zgłoszenia zamknięte jako removed PRZED usunięciem zdjęcia i plików", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_A, status: "pending" }] });
    const res = await organizer.resolveGalleryReport(EVENT_A, REPORT, "remove");
    expect(res.status).toBe("success");
    const close = db.queries.findIndex((q) => q.table === "event_photo_reports" && q.op === "update");
    const del = db.queries.findIndex((q) => q.table === "event_photos" && q.op === "delete");
    expect(close).toBeGreaterThanOrEqual(0);
    expect(del).toBeGreaterThan(close);
    expect(db.queries[close].payload).toMatchObject({ status: "removed" });
    expect(db.storage.remove).toHaveBeenCalledWith([`${EVENT_A}/${P1}/display.jpg`, `${EVENT_A}/${P1}/thumb.jpg`]);
  });

  it("zgłoszenie już rozpatrzone albo z innego eventu → błąd", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_A, status: "kept" }] });
    expect(await organizer.resolveGalleryReport(EVENT_A, REPORT, "keep")).toMatchObject({ status: "error" });
    seed({ reports: [{ id: REPORT, event_id: EVENT_B, photo_id: P1, attendee_id: ATT_A, status: "pending" }] });
    expect(await organizer.resolveGalleryReport(EVENT_A, REPORT, "remove")).toMatchObject({ status: "error" });
  });

  it("nie właściciel eventu → brak dostępu", async () => {
    seed({ reports: [{ id: REPORT, event_id: EVENT_A, photo_id: P1, attendee_id: ATT_A, status: "pending" }] });
    own.event = null;
    expect(await organizer.resolveGalleryReport(EVENT_A, REPORT, "keep")).toMatchObject({ status: "error" });
    expect(db.queries.some((q) => q.op === "update" || q.op === "delete")).toBe(false);
  });
});

describe("logi", () => {
  const spies: ReturnType<typeof vi.spyOn>[] = [];
  afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

  it("treść zgłoszenia i adresy podpisane nie trafiają do logów (także przy błędzie)", async () => {
    for (const m of ["log", "info", "warn", "error", "debug"] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => {}));
    seed();
    await participant.getParticipantPhotoView("next-stop-lodz", P1);
    await participant.getParticipantPhotoDownload("next-stop-lodz", P1);
    await participant.loadParticipantPhotos("next-stop-lodz", {});
    await participant.reportParticipantPhoto("next-stop-lodz", P1, "other", "TAJNA-TRESC-ZGLOSZENIA");
    const base = db.tables.event_photo_reports;
    db.tables.event_photo_reports = (q) => (q.op === "insert" ? { error: { code: "XX000", message: "boom" } } : base(q));
    const failed = await participant.reportParticipantPhoto("next-stop-lodz", P2, "other", "TAJNA-TRESC-ZGLOSZENIA");
    expect(failed).toMatchObject({ ok: false });
    expect(JSON.stringify(failed)).not.toContain("TAJNA");

    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain("TAJNA-TRESC");
    expect(logged).not.toContain("token=SECRET");
  });
});
