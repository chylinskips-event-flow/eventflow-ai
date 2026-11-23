import { beforeEach, describe, expect, it, vi } from "vitest";

// Poprawki z raportu testów (20.11): właściciel przy akcjach wydarzenia, usuwanie zdjęć galerii,
// ponawianie weryfikacji P24, treść strony powitalnej jako tekst. Bez bazy: atrapy klientów.

const calls = { vercel: [] as string[], storageRemove: [] as string[][], orderUpdates: [] as unknown[], userClient: 0 };
const own = { event: null as null | Record<string, unknown> };

vi.mock("@/lib/events", () => ({
  getOwnEvent: async () => own.event,
  parseLines: () => [],
}));
vi.mock("@/lib/vercel-domains", () => ({
  addDomain: async (h: string) => (calls.vercel.push(`add ${h}`), { ok: true }),
  removeDomain: async (h: string) => void calls.vercel.push(`remove ${h}`),
  getDomainStatus: async () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    calls.userClient++;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "update", "eq", "in", "is"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: { slug: "cudzy", status: "published", name: "X", organization_id: "o" }, error: null });
    b.then = (done: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "e", slug: "cudzy", organization_id: "o" }], error: null }).then(done);
    return { from: () => b };
  },
}));
vi.mock("@/lib/entitlements", () => ({
  featureGate: async () => ({ ok: true }),
  hasFeature: async () => true,
}));
vi.mock("@/lib/orders", () => ({ getPaidOrderCount: async () => 0 }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("NEXT_REDIRECT"); } }));

const section = { content: { images: [{ storage_path: "ev1/sec1/1.webp" }] } };
const order = { id: "o1", event_id: "ev1", status: "pending", total_amount: 100, buyer_name: "Jan Nowak", buyer_email: "j@x.pl", p24_session_id: "s1" };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is"]) b[m] = () => b;
      b.update = (v: unknown) => (calls.orderUpdates.push({ table, v }), b);
      b.maybeSingle = async () => ({
        data: table === "event_sections" ? section : table === "orders" ? order : table === "events" ? { id: "ev1", organization_id: "org" } : null,
        error: null,
      });
      b.then = (done: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(done);
      return b;
    },
    storage: { from: () => ({ remove: async (paths: string[]) => (calls.storageRemove.push(paths), {}) }) },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const verify = { result: { ok: false, error: "P24 HTTP 503", retryable: true } as Record<string, unknown> };
vi.mock("@/lib/p24", () => ({
  getPaymentConfig: async () => ({ crc: "crc" }),
  computeNotifySign: () => "sig",
  verifyTransaction: async () => verify.result,
}));
vi.mock("@/lib/email/attendee-confirmation", () => ({ sendAttendeeConfirmationEmail: async () => {} }));
vi.mock("sharp", () => ({ default: () => ({}) }));

const eventActions = await import("@/app/(organizer)/admin/events/[eventId]/actions");
const sectionActions = await import("@/app/(organizer)/admin/events/[eventId]/content/event-sections-actions");
const webhook = await import("@/app/api/p24/webhook/route");
const { templateToPlainText } = await import("@/lib/message-templates");

beforeEach(() => {
  calls.vercel = [];
  calls.storageRemove = [];
  calls.orderUpdates = [];
  calls.userClient = 0;
  own.event = null;
  section.content.images = [{ storage_path: "ev1/sec1/1.webp" }];
  process.env.VERCEL_API_TOKEN = "t";
  process.env.VERCEL_PROJECT_ID = "p";
});

describe("akcje wydarzenia wymagają właściciela", () => {
  it("cudze wydarzenie: bez zmian w bazie i bez wywołań Vercela", async () => {
    expect(await eventActions.unpublishEvent("cudzy")).toMatchObject({ status: "error" });
    expect(await eventActions.softDeleteEvent("cudzy", "X")).toMatchObject({ status: "error" });
    expect(await eventActions.retrySubdomain("cudzy")).toBe("error");
    await expect(eventActions.publishEvent("cudzy")).rejects.toThrow();
    await expect(eventActions.startEvent("cudzy")).rejects.toThrow();
    await expect(eventActions.completeEvent("cudzy")).rejects.toThrow();
    const fd = new FormData();
    expect(await eventActions.updateEvent("cudzy", { status: "idle" }, fd)).toMatchObject({ status: "error" });
    expect(await eventActions.uploadEventLogo("cudzy", { status: "idle" }, fd)).toMatchObject({ status: "error" });
    expect(await eventActions.uploadEventBadgeBg("cudzy", { status: "idle" }, fd)).toMatchObject({ status: "error" });
    expect(calls.vercel).toEqual([]);
    expect(calls.userClient).toBe(0);
  });

  it("własne wydarzenie: cofnięcie publikacji zdejmuje subdomenę jak dotąd", async () => {
    own.event = { id: "e" };
    expect(await eventActions.unpublishEvent("e")).toEqual({ status: "success" });
    await vi.waitFor(() => expect(calls.vercel).toEqual(["remove cudzy.eventro.pl"]));
  });
});

describe("usuwanie zdjęcia z galerii sekcji", () => {
  beforeEach(() => {
    own.event = { id: "ev1", organization_id: "org" };
  });

  it("plik z tej sekcji jest usuwany", async () => {
    await sectionActions.removeGaleriaImage("ev1", "sec1", "ev1/sec1/1.webp");
    expect(calls.storageRemove).toEqual([["ev1/sec1/1.webp"]]);
  });

  it("ścieżka spoza sekcji (np. innego wydarzenia) nie trafia do Storage", async () => {
    await sectionActions.removeGaleriaImage("ev1", "sec1", "ev2/sec9/obce.webp");
    section.content.images = [{ storage_path: "ev2/sec9/obce.webp" }];
    await sectionActions.removeGaleriaImage("ev1", "sec1", "ev2/sec9/obce.webp");
    expect(calls.storageRemove).toEqual([]);
  });
});

describe("webhook P24", () => {
  const notify = () =>
    webhook.POST(
      new Request("https://eventro.pl/api/p24/webhook", {
        method: "POST",
        body: JSON.stringify({ sessionId: "s1", sign: "sig", amount: 100, orderId: 7, merchantId: 1, posId: 1, originAmount: 100, currency: "PLN", methodId: 1, statement: "x" }),
      }) as never,
    );

  it("chwilowy błąd weryfikacji: 503 do ponowienia, zamówienie nietknięte", async () => {
    verify.result = { ok: false, error: "P24 HTTP 503", retryable: true };
    const res = await notify();
    expect(res.status).toBe(503);
    expect(calls.orderUpdates).toEqual([]);
  });

  it("odmowa P24 (płatność nieudana): zamówienie anulowane jak dotąd", async () => {
    verify.result = { ok: true, data: { status: "failed" } };
    const res = await notify();
    expect(res.status).toBe(200);
    expect(calls.orderUpdates).toEqual([{ table: "orders", v: { status: "cancelled", p24_order_id: "7" } }]);
  });
});

describe("strona powitalna: treść szablonu jako tekst", () => {
  it("znaczniki i skrypty nie przechodzą, tekst i nowe linie zostają", () => {
    expect(templateToPlainText('Cześć <b>Jan</b>!<br>Do zobaczenia<script>alert(1)</script>')).toBe(
      "Cześć Jan!\nDo zobaczeniaalert(1)",
    );
    expect(templateToPlainText("<img src=x onerror=alert(1)>Tekst")).toBe("Tekst");
  });

  it("encje z podstawionych zmiennych wracają do zwykłych znaków", () => {
    expect(templateToPlainText("Firma &quot;A&amp;B&quot; &lt;3")).toBe('Firma "A&B" <3');
  });
});
