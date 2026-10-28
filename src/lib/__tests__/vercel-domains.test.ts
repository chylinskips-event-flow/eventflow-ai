import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDomainStatus } from "../vercel-domains";

// Status subdomeny: 404 z Vercela (domeny nie ma w projekcie) to stan celowy ("missing"),
// a nie błąd — panel pokazuje wtedy neutralną linię bez „Ponów”. Inne błędy → null.

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("VERCEL_API_TOKEN", "tok");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getDomainStatus", () => {
  it("404 → missing", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 }));
    expect(await getDomainStatus("nextstoplodz.eventro.pl")).toBe("missing");
  });

  it("inny błąd HTTP lub wyjątek → null", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    expect(await getDomainStatus("a.eventro.pl")).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await getDomainStatus("a.eventro.pl")).toBeNull();
  });

  it("domena w projekcie → status weryfikacji", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: "a.eventro.pl", verified: true }), { status: 200 }));
    expect(await getDomainStatus("a.eventro.pl")).toEqual({ name: "a.eventro.pl", verified: true });
  });

  it("brak konfiguracji Vercel → null bez zapytania", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "");
    expect(await getDomainStatus("a.eventro.pl")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
