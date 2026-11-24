import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

// Rzutnik Mixera (/p/[token]): nie działa dla wydarzenia usuniętego lub zawieszonego, a organizator
// może wygenerować nowy link (stary przestaje działać). Usunięcie uczestnika anonimizuje jego
// wiersze w migawce mixera (migracja z triggerem).

const db = createDbMock();
const own = { event: { id: "ev1", organization_id: "org1" } as { id: string; organization_id: string } | null };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));

const { getMixerLiveState } = await import("@/lib/mixer/getters");
const { rotatePresentToken } = await import("@/app/(organizer)/admin/events/[eventId]/mixer/actions");

const TOKEN = "33333333-3333-4333-8333-333333333333";
const mixer = (deleted_at: string | null = null) => ({
  id: "mx1",
  name: "Mixer",
  status: "running",
  rounds_count: 3,
  round_minutes: 15,
  break_after_round: null,
  present_token: TOKEN,
  events: { id: "ev1", organization_id: "org1", deleted_at },
});

beforeEach(() => {
  db.reset();
  own.event = { id: "ev1", organization_id: "org1" };
});

describe("getMixerLiveState — rzutnik Mixera", () => {
  it("działa dla aktywnego wydarzenia", async () => {
    db.results["mixers:select"] = () => ({ data: mixer(), error: null });
    const state = await getMixerLiveState(TOKEN);
    expect(state).toMatchObject({ mixerId: "mx1", presentToken: TOKEN, activeRound: null });
  });

  it("nie działa po usunięciu wydarzenia", async () => {
    db.results["mixers:select"] = () => ({ data: mixer("2026-11-20T10:00:00Z"), error: null });
    expect(await getMixerLiveState(TOKEN)).toBeNull();
  });

  it("nie działa po zawieszeniu wydarzenia lub organizacji", async () => {
    db.results["mixers:select"] = () => ({ data: mixer(), error: null });
    db.results["event_suspensions:select"] = () => ({ data: { event_id: "ev1" }, error: null });
    expect(await getMixerLiveState(TOKEN)).toBeNull();
    delete db.results["event_suspensions:select"];
    db.results["organization_suspensions:select"] = () => ({ data: { organization_id: "org1" }, error: null });
    expect(await getMixerLiveState(TOKEN)).toBeNull();
  });

  it("token w złym formacie → null bez zapytania", async () => {
    expect(await getMixerLiveState("nie-token")).toBeNull();
    expect(db.calls).toEqual([]);
  });
});

describe("rotatePresentToken — nowy link rzutnika", () => {
  it("zapisuje nowy losowy token tylko dla mixera tego wydarzenia", async () => {
    const res = await rotatePresentToken("ev1", "mx1");
    expect(res.status).toBe("success");
    const [update] = db.writes();
    expect(update.table).toBe("mixers");
    const token = (update.payload as { present_token: string }).present_token;
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(token).not.toBe(TOKEN);
    expect(update.filters).toEqual(expect.arrayContaining([["id", "mx1"], ["event_id", "ev1"]]));
  });

  it("mixer innego wydarzenia → „Mixer nie znaleziony.”", async () => {
    db.results["mixers:update"] = () => ({ data: [], error: null });
    expect(await rotatePresentToken("ev1", "obcy")).toEqual({ status: "error", message: "Mixer nie znaleziony." });
  });

  it("bez dostępu do wydarzenia → brak zapisu", async () => {
    own.event = null;
    expect((await rotatePresentToken("ev1", "mx1")).status).toBe("error");
    expect(db.writes()).toEqual([]);
  });
});

describe("migracja: anonimizacja migawki Mixera po usunięciu uczestnika", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const file = readdirSync(dir).find((f) => f.includes("mixer_participants_anonymize_on_attendee_delete"));
  const sql = file ? readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "").toLowerCase() : "";

  it("istnieje", () => expect(file).toBeTruthy());

  it("trigger BEFORE DELETE na attendees (po usunięciu FK zeruje już attendee_id)", () => {
    expect(sql).toMatch(/create trigger anonymize_mixer_participant\s+before delete on public\.attendees\s+for each row/);
  });

  it("czyści imię i firmę wierszy tej osoby, aktywne oznacza jako rezygnację", () => {
    expect(sql).toMatch(/update public\.mixer_participants\s+set display_name = 'usunięty uczestnik',\s+company\s+= null/);
    expect(sql).toContain("where attendee_id = old.id");
    expect(sql).toMatch(/case when status = 'active' then 'dropped'/);
  });

  it("uzupełnia wcześniejsze usunięcia i nie dotyka polityk RLS", () => {
    expect(sql).toMatch(/where attendee_id is null/);
    expect(sql).not.toMatch(/create policy|drop policy|disable row level security/);
  });

  it("funkcja triggera nie jest wywoływalna przez role klienckie", () => {
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toMatch(/revoke all on function public\.anonymize_mixer_participant_on_attendee_delete\(\) from public, anon, authenticated/);
  });
});
