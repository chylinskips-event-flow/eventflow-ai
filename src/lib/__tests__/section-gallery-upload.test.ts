import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

// Galeria w sekcji strony wydarzenia: uszkodzony plik → komunikat (bez wyjątku), sekcja sprawdzana
// przed zapisem do Storage, nieudany zapis sekcji nie zostawia pliku.

const EVENT = "11111111-1111-4111-8111-111111111111";
const SECTION = "22222222-2222-4222-8222-222222222222";

const db = vi.hoisted(() => ({
  section: null as null | { content: Record<string, unknown> },
  updateResult: { data: [{ id: "s" }] as unknown, error: null as unknown },
  calls: [] as string[],
  uploads: [] as string[],
  removed: [] as string[][],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      let op = "select";
      const b: Record<string, unknown> = {
        select: () => b,
        update: () => ((op = "update"), b),
        eq: () => b,
        maybeSingle: async () => {
          db.calls.push("section-select");
          return { data: db.section, error: null };
        },
        then: (res: (v: unknown) => unknown) => {
          db.calls.push(`section-${op}`);
          return Promise.resolve(op === "update" ? db.updateResult : { data: null, error: null }).then(res);
        },
      };
      return b;
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          db.calls.push("upload");
          db.uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x/${path}` } }),
        remove: async (paths: string[]) => {
          db.removed.push(paths);
          return { error: null };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => ({ id: EVENT, organization_id: "org" }) }));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { uploadGaleriaImage } = await import("@/app/(organizer)/admin/events/[eventId]/content/event-sections-actions");

const form = (body: BlobPart, type = "image/jpeg") => {
  const fd = new FormData();
  fd.set("image", new File([body], "a.jpg", { type }));
  return fd;
};

beforeEach(() => {
  db.section = { content: { images: [] } };
  db.updateResult = { data: [{ id: SECTION }], error: null };
  db.calls = [];
  db.uploads = [];
  db.removed = [];
});

describe("uploadGaleriaImage", () => {
  it("uszkodzony plik z poprawnym typem → komunikat po polsku, nic nie trafia do Storage", async () => {
    const res = await uploadGaleriaImage(EVENT, SECTION, form(Buffer.from("to nie jest obraz")));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Nie udało się odczytać obrazu/);
    expect(db.uploads).toEqual([]);
  });

  it("nieistniejąca sekcja → błąd przed zapisem do Storage", async () => {
    db.section = null;
    const jpg = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#09f" } }).jpeg().toBuffer();
    const res = await uploadGaleriaImage(EVENT, SECTION, form(new Uint8Array(jpg)));
    expect(res).toEqual({ ok: false, error: "Sekcja nie istnieje." });
    expect(db.uploads).toEqual([]);
  });

  it("poprawny obraz → WebP w folderze sekcji, zapis sekcji po wgraniu", async () => {
    const jpg = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#09f" } }).jpeg().toBuffer();
    const res = await uploadGaleriaImage(EVENT, SECTION, form(new Uint8Array(jpg)));
    expect(res.ok).toBe(true);
    expect(res.storage_path).toMatch(new RegExp(`^${EVENT}/${SECTION}/\\d+\\.webp$`));
    expect(db.calls.indexOf("section-select")).toBeLessThan(db.calls.indexOf("upload"));
    expect(db.removed).toEqual([]);
  });

  it("nieudany zapis sekcji → wgrany plik usunięty, komunikat błędu", async () => {
    db.updateResult = { data: [], error: null };
    const jpg = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#09f" } }).jpeg().toBuffer();
    const res = await uploadGaleriaImage(EVENT, SECTION, form(new Uint8Array(jpg)));
    expect(res.ok).toBe(false);
    expect(db.removed).toEqual([db.uploads]);
  });
});
