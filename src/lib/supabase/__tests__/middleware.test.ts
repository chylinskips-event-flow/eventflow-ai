import { describe, it, expect, vi, afterEach } from "vitest";
import { isEventSuspended } from "../middleware";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

afterEach(() => vi.unstubAllGlobals());

describe("isEventSuspended", () => {
  it("woła RPC is_event_suspended kluczem anon i zwraca boolean", async () => {
    const fetchMock = vi.fn(async () => new Response("true", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await isEventSuspended("ev1")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://db.example/rest/v1/rpc/is_event_suspended");
    expect(JSON.parse(String(init.body))).toEqual({ p_slug: "ev1" });
  });

  it("false gdy event nie jest zawieszony", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("false")));
    expect(await isEventSuspended("ev2")).toBe(false);
  });

  it("awaria bazy / błąd HTTP → false (nie wyłączamy stron przez awarię)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    expect(await isEventSuspended("ev1")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network");
    }));
    expect(await isEventSuspended("ev1")).toBe(false);
  });
});
