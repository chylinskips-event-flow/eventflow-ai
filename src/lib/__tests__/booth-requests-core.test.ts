import { describe, expect, it } from "vitest";
import {
  OTHER_NEEDS_LABEL,
  aggregateTotals,
  approvedQty,
  inPackagePendingIds,
  includedFor,
  isAfterDeadline,
  isOverPackage,
  parseIncludedByTier,
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

  it("validateRequestInfo: kolejność i zakres organizatora", () => {
    const info = {
      crew_count: 3,
      setup_start: "2026-11-01T08:00:00Z",
      setup_end: "2026-11-01T10:00:00Z",
      teardown_start: null,
      teardown_end: null,
      vehicle: false,
      vehicle_note: null,
    };
    expect(validateRequestInfo(info, EMPTY_SETTINGS)).toBeNull();
    expect(validateRequestInfo({ ...info, setup_end: "2026-11-01T07:00:00Z" }, EMPTY_SETTINGS)).toMatch(/przed końcem/);
    const settings = { ...EMPTY_SETTINGS, setup_from: "2026-11-01T09:00:00Z", setup_to: "2026-11-01T12:00:00Z" };
    expect(validateRequestInfo(info, settings)).toMatch(/spoza zakresu/);
    expect(validateRequestInfo({ ...info, crew_count: 9999 }, EMPTY_SETTINGS)).toMatch(/osób obsługi/);
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

describe("status i decyzje", () => {
  it("requestStatus", () => {
    expect(requestStatusLabel(requestStatus(null))).toBe("Brak wniosku");
    expect(requestStatusLabel(requestStatus([item(), item({ status: "approved" })]))).toBe("Do akceptacji (1)");
    expect(requestStatus([item({ status: "approved" })])).toEqual({ kind: "approved" });
    expect(requestStatus([item({ status: "rejected" })])).toEqual({ kind: "rejected" });
    expect(requestStatus([item({ status: "changed" })])).toEqual({ kind: "partial" });
    expect(requestStatus([item({ status: "approved" }), item({ status: "rejected" })])).toEqual({ kind: "partial" });
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
