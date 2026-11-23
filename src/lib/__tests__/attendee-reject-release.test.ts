import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutDbMock } from "./helpers/checkout-db-mock";

// Odrzucenie zgłoszenia: bilet wydany bez płatności (darmowy / rabat 100%) oddaje miejsce w puli
// i użycie kodu — atomowo w SQL (release_rejected_attendee_tickets), tylko po autoryzacji organizatora.

const admin = createCheckoutDbMock();
const userDb = createCheckoutDbMock();
const own = { event: { id: "ev1", name: "Konf" } as Record<string, unknown> | null };
const rejectedMail = vi.fn(async () => {});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userDb.client }));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("@/lib/attendee-deletion", () => ({ deleteAttendeeCompletely: async () => ({}) }));
vi.mock("@/lib/email/attendee-confirmation", () => ({
  sendAttendeeConfirmationEmail: async () => {},
  sendAttendeeRejectedEmail: (...a: unknown[]) => rejectedMail(...(a as [])),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { rejectAttendee } = await import("@/app/(organizer)/admin/events/[eventId]/attendees/actions");

beforeEach(() => {
  admin.reset();
  userDb.reset();
  rejectedMail.mockClear();
  own.event = { id: "ev1", name: "Konf" };
  userDb.results["attendees:update"] = () => ({
    data: { email: "anna@example.com", first_name: "Anna" },
    error: null,
  });
});

describe("rejectAttendee", () => {
  it("odrzucenie zwalnia bilet bez płatności tego uczestnika w obrębie wydarzenia", async () => {
    const result = await rejectAttendee("ev1", "att1");
    expect(result.status).toBe("success");
    const update = userDb.calls.find((c) => c.table === "attendees" && c.op === "update");
    expect(update?.payload).toEqual({ status: "rejected" });
    expect(admin.rpcCalls).toEqual([
      { fn: "release_rejected_attendee_tickets", args: { p_event_id: "ev1", p_attendee_id: "att1" } },
    ]);
    expect(rejectedMail).toHaveBeenCalledTimes(1);
  });

  it("bez uprawnień do wydarzenia: nic nie jest zwalniane", async () => {
    own.event = null;
    const result = await rejectAttendee("ev1", "att1");
    expect(result.status).toBe("error");
    expect(admin.rpcCalls).toHaveLength(0);
    expect(userDb.calls).toHaveLength(0);
  });

  it("nieudana zmiana statusu (np. uczestnik z innego wydarzenia): nic nie jest zwalniane", async () => {
    userDb.results["attendees:update"] = () => ({ data: null, error: { message: "no rows" } });
    const result = await rejectAttendee("ev1", "att-obcy");
    expect(result.status).toBe("error");
    expect(admin.rpcCalls).toHaveLength(0);
  });

  it("błąd zwolnienia nie blokuje odrzucenia ani maila", async () => {
    admin.rpcResults.release_rejected_attendee_tickets = () => ({ data: null, error: { message: "x" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await rejectAttendee("ev1", "att1");
    expect(result.status).toBe("success");
    expect(rejectedMail).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
