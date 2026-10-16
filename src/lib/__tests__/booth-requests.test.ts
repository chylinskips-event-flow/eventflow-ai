import { describe, expect, it, vi } from "vitest";

// Brak tabeli / kolumny (niezastosowana migracja) — PostgREST zwraca błąd zamiast danych.
const missingColumn = { data: null, error: { code: "42703", message: "column partner_booth_requests.vehicle_plate does not exist" } };
const query = {
  select: () => query,
  eq: () => query,
  order: () => query,
  maybeSingle: async () => missingColumn,
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => query }) }));

const { BoothDataError, getBoothRequest, getLogisticsSettings, loadBoothData } = await import("@/lib/booth-requests");

describe("odczyt logistyki przy braku migracji", () => {
  it("błąd bazy nie udaje „Brak wniosku” — rzuca BoothDataError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getBoothRequest("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(BoothDataError);
    await expect(getLogisticsSettings("e")).rejects.toBeInstanceOf(BoothDataError);
  });

  it("loadBoothData: błąd bazy → ok:false, inne wyjątki (np. redirect) lecą dalej", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadBoothData(() => getBoothRequest("p"))).toEqual({ ok: false });
    expect(await loadBoothData(async () => 1)).toEqual({ ok: true, value: 1 });
    await expect(loadBoothData(async () => { throw new Error("NEXT_REDIRECT"); })).rejects.toThrow("NEXT_REDIRECT");
  });
});
