import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock, type DbCall } from "@/lib/__tests__/helpers/db-mock";

// Decyzje organizatora w panelu partnera dotyczą wersji, którą organizator widział na stronie:
// wizytówka (submitted_at szkicu), pytanie przy stoisku (status) i pozycja stoiska (ilość).
// Jeśli partner zmienił coś w międzyczasie — odmowa z prośbą o odświeżenie.

const db = createDbMock();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "org-user" } } }) } }),
}));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => ({ id: "ev1", organization_id: "org1", name: "Expo" }) }));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));
vi.mock("@/lib/partner-leads", () => ({ isPartnerLeadsEnabled: () => true, logLeadAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/email/partner-invite", () => ({ sendPartnerInviteEmail: vi.fn() }));
vi.mock("@/lib/email/booth-request", () => ({ sendBoothDecisionEmail: vi.fn() }));
vi.mock("@/lib/booth-requests", () => ({
  BOOTH_LOAD_ERROR: "x",
  getBoothRequest: async () => null,
  getCatalog: async () => [],
  getPartnerRecipientEmails: async () => [],
  loadBoothData: async () => ({ ok: false }),
}));

const { approvePartnerDraft, reviewPartnerQuestion } = await import(
  "@/app/(organizer)/admin/events/[eventId]/partners/[partnerId]/actions"
);
const { decideBoothItem } = await import("@/app/(organizer)/admin/events/[eventId]/partners/[partnerId]/booth-actions");
const { parseSeenQty } = await import("@/lib/booth-requests-core");
const { PARTNER_DELETED_NOTE } = await import("@/lib/partner-leads-core");

const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Q = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const has = (c: DbCall, k: string, v: unknown) => c.filters.some(([fk, fv]) => fk === k && fv === v);
const fd = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};

beforeEach(() => {
  db.reset();
  db.results["partners:select"] = () => ({ data: { id: P, name: "Acme", tier: "gold" }, error: null });
});

describe("approvePartnerDraft — publikuje tylko oglądaną wersję wizytówki", () => {
  const SEEN = "2026-11-20T10:00:00.123+00:00";
  const draft = (submitted_at: string, status = "pending") => ({
    name: "Acme",
    logo_url: null,
    description: "Opis",
    website_url: null,
    offer: null,
    social_links: {},
    status,
    submitted_at,
  });

  it("ta sama wersja (inny zapis tej samej chwili) → publikacja i usunięcie dokładnie tej wersji szkicu", async () => {
    db.results["partner_profile_drafts:select"] = () => ({ data: draft("2026-11-20T10:00:00.123Z"), error: null });
    const res = await approvePartnerDraft("ev1", P, SEEN);
    expect(res.status).toBe("success");
    const update = db.writes().find((c) => c.table === "partners" && c.op === "update");
    expect(update?.payload).toMatchObject({ name: "Acme", description: "Opis" });
    const del = db.writes().find((c) => c.table === "partner_profile_drafts" && c.op === "delete");
    expect(del && has(del, "submitted_at", "2026-11-20T10:00:00.123Z")).toBe(true);
  });

  it("partner wysłał nową wersję po załadowaniu strony → odmowa, nic nie zapisane", async () => {
    db.results["partner_profile_drafts:select"] = () => ({ data: draft("2026-11-20T10:05:00.000Z"), error: null });
    const res = await approvePartnerDraft("ev1", P, SEEN);
    expect(res).toMatchObject({ status: "error" });
    expect(res.message).toMatch(/Partner zmienił wizytówkę/);
    expect(db.writes()).toEqual([]);
  });

  it("brak wersji ze strony albo niepoprawna data → odmowa", async () => {
    db.results["partner_profile_drafts:select"] = () => ({ data: draft(SEEN), error: null });
    expect((await approvePartnerDraft("ev1", P, "")).status).toBe("error");
    expect((await approvePartnerDraft("ev1", P, "nie-data")).status).toBe("error");
    expect(db.writes()).toEqual([]);
  });

  it("szkic odrzucony lub usunięty → „Brak zmian do akceptacji”", async () => {
    db.results["partner_profile_drafts:select"] = () => ({ data: draft(SEEN, "rejected"), error: null });
    expect((await approvePartnerDraft("ev1", P, SEEN)).message).toBe("Brak zmian do akceptacji.");
    expect(db.writes()).toEqual([]);
  });
});

describe("reviewPartnerQuestion — pytanie wycofane przez partnera i nieaktualna strona", () => {
  const row = (status: string, review_note: string | null = null) => ({
    status,
    review_note,
    updated_at: "2026-11-20T10:00:00.000001+00:00",
  });

  it("wycofane przez partnera → nie da się ponownie zaakceptować", async () => {
    db.results["partner_questions:select"] = () => ({ data: row("rejected", PARTNER_DELETED_NOTE), error: null });
    const res = await reviewPartnerQuestion("ev1", P, Q, "approved", undefined, "pending");
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/Partner wycofał/);
    expect(db.writes()).toEqual([]);
  });

  it("status zmienił się od załadowania strony → odmowa", async () => {
    db.results["partner_questions:select"] = () => ({ data: row("rejected", "Popraw treść"), error: null });
    const res = await reviewPartnerQuestion("ev1", P, Q, "approved", undefined, "pending");
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/zmieniło się w międzyczasie/);
    expect(db.writes()).toEqual([]);
  });

  it("aktualne pytanie → zapis warunkowy (status i updated_at z odczytu)", async () => {
    db.results["partner_questions:select"] = () => ({ data: row("pending"), error: null });
    db.results["partner_questions:update"] = () => ({ data: [{ id: Q, prompt: "Pytanie?" }], error: null });
    const res = await reviewPartnerQuestion("ev1", P, Q, "approved", undefined, "pending");
    expect(res.status).toBe("success");
    const update = db.writes().find((c) => c.table === "partner_questions");
    expect(update && has(update, "status", "pending")).toBe(true);
    expect(update && has(update, "updated_at", "2026-11-20T10:00:00.000001+00:00")).toBe(true);
  });

  it("wiersz zmienił się między odczytem a zapisem → komunikat o odświeżeniu", async () => {
    db.results["partner_questions:select"] = () => ({ data: row("pending"), error: null });
    db.results["partner_questions:update"] = () => ({ data: [], error: null });
    const res = await reviewPartnerQuestion("ev1", P, Q, "rejected", "Nie", "pending");
    expect(res.message).toMatch(/zmieniło się w międzyczasie/);
  });

  it("organizator może zmienić własne odrzucenie na akceptację", async () => {
    db.results["partner_questions:select"] = () => ({ data: row("rejected", "Popraw"), error: null });
    db.results["partner_questions:update"] = () => ({ data: [{ id: Q, prompt: "Pytanie?" }], error: null });
    expect((await reviewPartnerQuestion("ev1", P, Q, "approved", undefined, "rejected")).status).toBe("success");
  });
});

describe("decideBoothItem — decyzja dotyczy ilości widzianej przez organizatora", () => {
  const idle = { status: "idle" as const };

  it.each(["approve", "reject", "change"] as const)("%s: zapis tylko przy niezmienionej ilości", async (decision) => {
    db.results["partner_booth_request_items:update"] = () => ({ data: [{ id: ITEM }], error: null });
    const res = await decideBoothItem("ev1", P, ITEM, decision, idle, fd({ seen_qty: "2", approved_qty: "1" }));
    expect(res.status).toBe("success");
    const update = db.writes().find((c) => c.table === "partner_booth_request_items");
    expect(update && has(update, "qty", 2)).toBe(true);
  });

  it("partner zmienił ilość (×2 → ×40) → zatwierdzenie odrzucone", async () => {
    db.results["partner_booth_request_items:update"] = () => ({ data: [], error: null });
    const res = await decideBoothItem("ev1", P, ITEM, "approve", idle, fd({ seen_qty: "2" }));
    expect(res).toEqual({ status: "error", message: "Pozycja zmieniła się w międzyczasie — odśwież stronę." });
  });

  it("„inna ilość” liczona względem ilości ze strony, nie bieżącej z bazy", async () => {
    db.results["partner_booth_request_items:update"] = () => ({ data: [{ id: ITEM }], error: null });
    const res = await decideBoothItem("ev1", P, ITEM, "change", idle, fd({ seen_qty: "2", approved_qty: "3" }));
    expect(res.status).toBe("error");
    expect(db.writes()).toEqual([]);
  });

  it("brak ilości ze strony → odmowa bez zapisu", async () => {
    const res = await decideBoothItem("ev1", P, ITEM, "approve", idle, fd({}));
    expect(res.status).toBe("error");
    expect(db.writes()).toEqual([]);
  });

  it("parseSeenQty", () => {
    expect(parseSeenQty("2")).toBe(2);
    expect(parseSeenQty(" 999 ")).toBe(999);
    for (const bad of [null, "", "0", "-1", "1.5", "1000", "abc"]) expect(parseSeenQty(bad)).toBeNull();
  });
});
