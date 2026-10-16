import { describe, expect, it } from "vitest";
import {
  OTHER_NEEDS_LABEL,
  aggregateTotals,
  approvedQty,
  effectiveStatus,
  parseApprovedQty,
  inPackagePendingIds,
  includedFor,
  isAfterDeadline,
  isOverPackage,
  normalizePlate,
  parseIncludedByTier,
  parseSlotStep,
  parseWindows,
  readWindows,
  requestTimesLabel,
  slotFits,
  slotTimes,
  slotWithinWindows,
  toLocalSlot,
  vehicleLabel,
  parseRequestItems,
  planRequestItems,
  requestStatus,
  requestStatusLabel,
  validateCatalogInput,
  validateRequestInfo,
  EMPTY_SETTINGS,
  type RequestItem,
} from "@/lib/booth-requests-core";
import { toExcelCsv } from "@/lib/csv";

const getter = (data: Record<string, string>) => (k: string) => data[k] ?? null;

function item(over: Partial<RequestItem> = {}): RequestItem {
  return {
    id: "i1",
    catalog_item_id: "c1",
    label: "Stół",
    unit: "szt.",
    qty: 2,
    note: null,
    status: "pending",
    approved_qty: null,
    decision_note: null,
    reviewed_at: null,
    ...over,
  };
}

const catalog = [
  { id: "c1", name: "Stół", unit: "szt.", active: true, included_by_tier: { gold: 2, silver: 1 } },
  { id: "c2", name: "Krzesło", unit: "szt.", active: true, included_by_tier: {} },
  { id: "c3", name: "Ekran", unit: "szt.", active: false, included_by_tier: {} },
];

describe("katalog i pakiet", () => {
  it("parseIncludedByTier odrzuca nieznane poziomy i złe wartości", () => {
    expect(parseIncludedByTier({ gold: 2, silver: -1, vip: 3, bronze: 1.5 })).toEqual({ gold: 2 });
    expect(parseIncludedByTier(null)).toEqual({});
  });
  it("includedFor / isOverPackage", () => {
    expect(includedFor(catalog[0], "gold")).toBe(2);
    expect(includedFor(catalog[0], "bronze")).toBeNull();
    expect(includedFor(catalog[0], null)).toBeNull();
    expect(isOverPackage(3, 2)).toBe(true);
    expect(isOverPackage(2, 2)).toBe(false);
    expect(isOverPackage(50, null)).toBe(false);
  });
  it("validateCatalogInput — limity per poziom, puste = brak limitu", () => {
    const r = validateCatalogInput(getter({ name: " Stół ", included_gold: "2", included_silver: "" }));
    expect(r).toEqual({
      ok: true,
      value: { name: "Stół", unit: "szt.", description: null, active: true, included_by_tier: { gold: 2 } },
    });
    expect(validateCatalogInput(getter({ name: "" })).ok).toBe(false);
    expect(validateCatalogInput(getter({ name: "X", included_gold: "-1" })).ok).toBe(false);
    expect(validateCatalogInput(getter({ name: "X", active: "false" }))).toMatchObject({ value: { active: false } });
  });
});

describe("wniosek partnera", () => {
  it("parseRequestItems: ilość 0 pomijana, nieaktywne ignorowane, inne potrzeby jako pozycja", () => {
    const r = parseRequestItems(
      getter({ qty_c1: "3", note_c1: "z obrusem", qty_c2: "0", qty_c3: "5", other_needs: "Woda" }),
      catalog,
    );
    expect(r).toEqual({
      ok: true,
      value: [
        { catalog_item_id: "c1", label: "Stół", unit: "szt.", qty: 3, note: "z obrusem" },
        { catalog_item_id: null, label: OTHER_NEEDS_LABEL, unit: "—", qty: 1, note: "Woda" },
      ],
    });
    expect(parseRequestItems(getter({ qty_c1: "abc" }), catalog).ok).toBe(false);
    expect(parseRequestItems(getter({ qty_c1: "1000" }), catalog).ok).toBe(false);
  });

  it("validateRequestInfo: limity pól i wymóg numeru rejestracyjnego", () => {
    const info = {
      crew_count: 3,
      setup_start: null,
      setup_end: null,
      teardown_start: null,
      teardown_end: null,
      setup_note: null,
      teardown_note: null,
      vehicle: true,
      vehicle_note: null,
      vehicle_plate: null,
      vehicle_type: null,
    };
    expect(validateRequestInfo(info, EMPTY_SETTINGS)).toBeNull();
    expect(validateRequestInfo(info, { ...EMPTY_SETTINGS, require_vehicle_plate: true })).toMatch(/numer rejestracyjny/);
    expect(validateRequestInfo({ ...info, vehicle_plate: "WX 12345" }, { ...EMPTY_SETTINGS, require_vehicle_plate: true })).toBeNull();
    expect(validateRequestInfo({ ...info, vehicle: false }, { ...EMPTY_SETTINGS, require_vehicle_plate: true })).toBeNull();
    expect(validateRequestInfo({ ...info, crew_count: 9999 }, EMPTY_SETTINGS)).toMatch(/osób obsługi/);
    expect(validateRequestInfo({ ...info, setup_note: "x".repeat(201) }, EMPTY_SETTINGS)).toMatch(/opis godzin/);
  });

  it("normalizePlate", () => {
    expect(normalizePlate("  wx   12345 ")).toBe("WX 12345");
    expect(normalizePlate("")).toBeNull();
    expect(normalizePlate("WX-1234<script>")).toBe("invalid");
    expect(normalizePlate("A".repeat(16))).toBe("invalid");
  });

  it("vehicleLabel", () => {
    expect(vehicleLabel({ vehicle: false, vehicle_type: "van", vehicle_plate: "X", vehicle_note: null })).toBe("Nie");
    expect(vehicleLabel({ vehicle: true, vehicle_type: "van", vehicle_plate: "WX 1", vehicle_note: "30 min" })).toBe(
      "Tak — dostawczy, WX 1 — 30 min",
    );
  });

  it("planRequestItems: tylko zmienione pozycje wracają do akceptacji", () => {
    const existing = [
      item({ id: "a", catalog_item_id: "c1", qty: 2, status: "approved" }),
      item({ id: "b", catalog_item_id: "c2", qty: 4, status: "rejected" }),
      item({ id: "x", catalog_item_id: "c3", qty: 1, status: "approved" }),
    ];
    const plan = planRequestItems(
      existing,
      [
        { catalog_item_id: "c1", label: "Stół", unit: "szt.", qty: 2, note: null },
        { catalog_item_id: "c2", label: "Krzesło", unit: "szt.", qty: 6, note: null },
        { catalog_item_id: null, label: OTHER_NEEDS_LABEL, unit: "—", qty: 1, note: "Woda" },
      ],
      new Set(["c3"]),
    );
    expect(plan.unchanged.sort()).toEqual(["a", "x"]);
    expect(plan.updates.map((u) => u.id)).toEqual(["b"]);
    expect(plan.inserts.map((i) => i.label)).toEqual([OTHER_NEEDS_LABEL]);
    expect(plan.deletes).toEqual([]);
  });

  it("planRequestItems: ilość 0 usuwa pozycję, zmiana uwagi = zmiana", () => {
    const existing = [item({ id: "a", note: "x" }), item({ id: "b", catalog_item_id: "c2" })];
    const plan = planRequestItems(existing, [{ catalog_item_id: "c1", label: "Stół", unit: "szt.", qty: 2, note: "y" }]);
    expect(plan.updates.map((u) => u.id)).toEqual(["a"]);
    expect(plan.deletes).toEqual(["b"]);
  });

  it("isAfterDeadline", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(isAfterDeadline(null, now)).toBe(false);
    expect(isAfterDeadline("2026-10-16T11:00:00Z", now)).toBe(true);
    expect(isAfterDeadline("2026-10-17T00:00:00Z", now)).toBe(false);
  });
});

describe("okna montażu / demontażu", () => {
  const win = { date: "2026-11-17", from: "14:00", to: "20:00" };

  it("readWindows: pomija puste wiersze, odrzuca niepełne i odwrócone, sortuje", () => {
    const fd = (rows: [string, string, string][]) => (k: string) =>
      rows.map((r) => (k.endsWith("_date") ? r[0] : k.endsWith("_from") ? r[1] : r[2]));
    expect(
      readWindows(fd([["2026-11-18", "08:00", "10:00"], ["", "", ""], ["2026-11-17", "14:00", "20:00"]]), "setup", "Montaż"),
    ).toEqual({ ok: true, value: [win, { date: "2026-11-18", from: "08:00", to: "10:00" }] });
    expect(readWindows(fd([["2026-11-17", "14:00", ""]]), "setup", "Montaż").ok).toBe(false);
    expect(readWindows(fd([["2026-11-17", "20:00", "14:00"]]), "setup", "Montaż").ok).toBe(false);
  });

  it("parseWindows / parseSlotStep odrzucają śmieci", () => {
    expect(parseWindows([win, { date: "x", from: "1", to: "2" }, null])).toEqual([win]);
    expect(parseWindows("[]")).toEqual([]);
    expect(parseSlotStep(15)).toBe(15);
    expect(parseSlotStep(7)).toBe(30);
  });

  it("slotTimes: co krok od początku okna, zawsze z końcem", () => {
    expect(slotTimes({ from: "14:00", to: "15:30" }, 30)).toEqual(["14:00", "14:30", "15:00", "15:30"]);
    expect(slotTimes({ from: "14:10", to: "15:00" }, 30)).toEqual(["14:10", "14:40", "15:00"]);
  });

  it("slotFits: okno 14:00–20:00, wybór 16:00–18:00 tak, poza oknem / poza krokiem nie", () => {
    expect(slotFits({ date: "2026-11-17", from: "16:00", to: "18:00" }, [win], 30)).toBe(true);
    expect(slotFits({ date: "2026-11-17", from: "13:30", to: "15:00" }, [win], 30)).toBe(false);
    expect(slotFits({ date: "2026-11-17", from: "19:00", to: "21:00" }, [win], 30)).toBe(false);
    expect(slotFits({ date: "2026-11-18", from: "16:00", to: "18:00" }, [win], 30)).toBe(false);
    expect(slotFits({ date: "2026-11-17", from: "16:10", to: "18:00" }, [win], 30)).toBe(false);
    expect(slotFits({ date: "2026-11-17", from: "18:00", to: "16:00" }, [win], 30)).toBe(false);
    expect(slotFits({ date: "2026-11-17", from: "16:15", to: "18:00" }, [win], 15)).toBe(true);
  });

  it("slotWithinWindows: do oznaczania „do poprawy” (bez kroku)", () => {
    expect(slotWithinWindows({ date: "2026-11-17", from: "16:10", to: "18:00" }, [win])).toBe(true);
    expect(slotWithinWindows({ date: "2026-11-17", from: "13:00", to: "18:00" }, [win])).toBe(false);
  });

  it("toLocalSlot: timestamptz → dzień i godziny w strefie wydarzenia", () => {
    // 17.11 w Warszawie to UTC+1.
    expect(toLocalSlot("2026-11-17T15:00:00Z", "2026-11-17T17:00:00Z", "Europe/Warsaw")).toEqual({
      date: "2026-11-17",
      from: "16:00",
      to: "18:00",
    });
    expect(toLocalSlot("2026-11-17T22:00:00Z", "2026-11-18T01:00:00Z", "Europe/Warsaw")).toBeNull();
    expect(toLocalSlot(null, null, "Europe/Warsaw")).toBeNull();
  });

  it("requestTimesLabel: wybór z okna albo opis orientacyjny", () => {
    expect(requestTimesLabel("2026-11-17T15:00:00Z", "2026-11-17T17:00:00Z", null, "Europe/Warsaw")).toMatch(/16:00–18:00$/);
    expect(requestTimesLabel(null, null, "ok. 16", "Europe/Warsaw")).toBe("orientacyjnie: ok. 16");
    expect(requestTimesLabel(null, null, null, "Europe/Warsaw")).toBeNull();
  });
});

describe("status i decyzje", () => {
  it("requestStatus", () => {
    expect(requestStatusLabel(requestStatus(null))).toBe("Brak wniosku");
    expect(requestStatusLabel(requestStatus([item(), item({ status: "approved" })]))).toBe("Do akceptacji (1)");
    expect(requestStatus([item({ status: "approved" })])).toEqual({ kind: "approved" });
    expect(requestStatus([item({ status: "rejected" })])).toEqual({ kind: "rejected" });
    expect(requestStatus([item({ status: "changed", qty: 4, approved_qty: 2 })])).toEqual({ kind: "partial" });
    // „Inna ilość” równa wnioskowanej to zwykłe zatwierdzenie (dane sprzed poprawki).
    expect(requestStatus([item({ status: "changed", qty: 4, approved_qty: 4 })])).toEqual({ kind: "approved" });
    expect(effectiveStatus(item({ status: "changed", qty: 4, approved_qty: 4 }))).toBe("approved");
    expect(effectiveStatus(item({ status: "changed", qty: 4, approved_qty: 3 }))).toBe("changed");
    expect(requestStatus([item({ status: "approved" }), item({ status: "rejected" })])).toEqual({ kind: "partial" });
  });

  it("parseApprovedQty: od 1 do wnioskowanej, 0 → „Odrzuć”", () => {
    expect(parseApprovedQty("3", 4)).toEqual({ ok: true, value: 3 });
    expect(parseApprovedQty("4", 4)).toEqual({ ok: true, value: 4 });
    expect(parseApprovedQty("0", 4)).toMatchObject({ ok: false, error: expect.stringMatching(/Odrzuć/) });
    expect(parseApprovedQty("5", 4)).toMatchObject({ ok: false, error: expect.stringMatching(/większa niż wnioskowana/) });
    expect(parseApprovedQty("", 4).ok).toBe(false);
    expect(parseApprovedQty(null, 4).ok).toBe(false);
  });

  it("approvedQty", () => {
    expect(approvedQty(item({ status: "approved", qty: 3 }))).toBe(3);
    expect(approvedQty(item({ status: "changed", qty: 3, approved_qty: 1 }))).toBe(1);
    expect(approvedQty(item({ status: "pending", qty: 3 }))).toBe(0);
    expect(approvedQty(item({ status: "rejected", qty: 3 }))).toBe(0);
  });

  it("inPackagePendingIds: w limicie albo bez limitu; ponad pakiet i inne potrzeby ręcznie", () => {
    const items = [
      item({ id: "in", catalog_item_id: "c1", qty: 2 }),
      item({ id: "free", catalog_item_id: "c2", qty: 10 }),
      item({ id: "done", catalog_item_id: "c2", qty: 1, status: "approved" }),
      item({ id: "other", catalog_item_id: null, label: OTHER_NEEDS_LABEL }),
    ];
    expect(inPackagePendingIds(items, catalog, "gold")).toEqual(["in", "free"]);
    expect(inPackagePendingIds(items, catalog, "silver")).toEqual(["free"]);
  });
});

describe("widok zbiorczy", () => {
  it("aggregateTotals sumuje zatwierdzone i oczekujące per pozycja", () => {
    const totals = aggregateTotals(
      [
        {
          partnerId: "p1",
          partnerName: "Acme",
          items: [
            item({ id: "1", catalog_item_id: "c1", qty: 2, status: "approved" }),
            item({ id: "2", catalog_item_id: "c2", qty: 4, status: "changed", approved_qty: 3 }),
            item({ id: "3", catalog_item_id: null, label: OTHER_NEEDS_LABEL, status: "approved" }),
          ],
        },
        {
          partnerId: "p2",
          partnerName: "Beta",
          items: [
            item({ id: "4", catalog_item_id: "c1", qty: 1, status: "pending" }),
            item({ id: "5", catalog_item_id: "c2", qty: 5, status: "rejected" }),
          ],
        },
      ],
      catalog,
    );
    expect(totals.map((t) => [t.label, t.approved, t.pending])).toEqual([
      ["Stół", 2, 1],
      ["Krzesło", 3, 0],
    ]);
    expect(totals[0].byPartner).toEqual([
      { partnerId: "p1", partnerName: "Acme", approved: 2, pending: 0 },
      { partnerId: "p2", partnerName: "Beta", approved: 0, pending: 1 },
    ]);
  });

  it("toExcelCsv: BOM, średnik, cytowanie, neutralizacja formuł", () => {
    const csv = toExcelCsv(["Pozycja", "Ilość"], [["Stół; duży", 2], ["=SUM(A1)", 0], ['Ekran "55"', 1]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["Pozycja;Ilość", '"Stół; duży";2', "'=SUM(A1);0", '"Ekran ""55""";1']);
  });
});
