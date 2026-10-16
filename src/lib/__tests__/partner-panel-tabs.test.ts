import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAB,
  computeProgress,
  computeTabs,
  nextTasks,
  resolveTab,
  type PanelState,
} from "@/lib/partner-panel-tabs";

const booth = (over: Partial<NonNullable<PanelState["booth"]>> = {}): NonNullable<PanelState["booth"]> => ({
  loadError: false,
  hasRequest: false,
  pendingItems: 0,
  timesNeedFix: false,
  locked: false,
  deadlineLabel: "10 lis 2026, 23:59",
  ...over,
});

const state = (over: Partial<PanelState> = {}): PanelState => ({
  profile: { draftStatus: null, hasLogo: true, hasDescription: true },
  materials: ["approved"],
  booth: booth({ hasRequest: true }),
  leads: null,
  contact: { hasContact: true },
  ...over,
});

const statusOf = (s: PanelState, key: string) => computeTabs(s).find((t) => t.key === key)?.status;
const keys = (s: PanelState) => computeTabs(s).map((t) => t.key);

describe("widoczność zakładek", () => {
  it("bez Fazy B nie ma „Leady”; „Co dalej?” zawsze pierwsza", () => {
    expect(keys(state())).toEqual(["przeglad", "wizytowka", "materialy", "stoisko", "kontakt"]);
  });
  it("„Leady” tylko z włączoną flagą", () => {
    expect(keys(state({ leads: { pendingQuestions: 0, approvedQuestions: 0 } }))).toEqual(["przeglad", "wizytowka", "materialy", "stoisko", "leady", "kontakt"]);
  });
  it("„Stoisko” ukryte, gdy sekcja niedostępna", () => {
    expect(keys(state({ booth: null }))).not.toContain("stoisko");
  });
});

describe("?tab=", () => {
  const tabs = computeTabs(state());
  it("otwiera właściwą zakładkę", () => {
    expect(resolveTab("stoisko", tabs)).toBe("stoisko");
    expect(resolveTab(["kontakt", "x"], tabs)).toBe("kontakt");
  });
  it("nieznana, pusta albo ukryta wartość → domyślna", () => {
    expect(resolveTab("cokolwiek", tabs)).toBe(DEFAULT_TAB);
    expect(resolveTab(undefined, tabs)).toBe(DEFAULT_TAB);
    expect(resolveTab("leady", tabs)).toBe(DEFAULT_TAB);
  });
});

describe("znaczniki ✓ / ● / ⏳", () => {
  it("Wizytówka", () => {
    expect(statusOf(state(), "wizytowka")).toBe("done");
    expect(statusOf(state({ profile: { draftStatus: "pending", hasLogo: false, hasDescription: false } }), "wizytowka")).toBe("waiting");
    expect(statusOf(state({ profile: { draftStatus: null, hasLogo: false, hasDescription: true } }), "wizytowka")).toBe("todo");
    expect(statusOf(state({ profile: { draftStatus: null, hasLogo: true, hasDescription: false } }), "wizytowka")).toBe("todo");
    expect(statusOf(state({ profile: { draftStatus: "rejected", hasLogo: true, hasDescription: true } }), "wizytowka")).toBe("todo");
  });
  it("Materiały", () => {
    expect(statusOf(state({ materials: [] }), "materialy")).toBe("todo");
    expect(statusOf(state({ materials: ["approved", "pending"] }), "materialy")).toBe("waiting");
    expect(statusOf(state({ materials: ["approved", "rejected"] }), "materialy")).toBe("done");
    expect(statusOf(state({ materials: ["rejected"] }), "materialy")).toBe("todo");
  });
  it("Stoisko", () => {
    expect(statusOf(state({ booth: booth() }), "stoisko")).toBe("todo");
    expect(statusOf(state({ booth: booth({ locked: true }) }), "stoisko")).toBeNull();
    expect(statusOf(state({ booth: booth({ hasRequest: true, pendingItems: 2 }) }), "stoisko")).toBe("waiting");
    expect(statusOf(state({ booth: booth({ hasRequest: true }) }), "stoisko")).toBe("done");
    expect(statusOf(state({ booth: booth({ hasRequest: true, timesNeedFix: true }) }), "stoisko")).toBe("todo");
    expect(statusOf(state({ booth: booth({ loadError: true }) }), "stoisko")).toBeNull();
  });
  it("Kontakt", () => {
    expect(statusOf(state(), "kontakt")).toBe("done");
    expect(statusOf(state({ contact: { hasContact: false } }), "kontakt")).toBe("todo");
  });
});

describe("pasek postępu", () => {
  it("liczy tylko widoczne zakładki z zadaniem (bez „Co dalej?” i „Leady”)", () => {
    expect(computeProgress(computeTabs(state()))).toEqual({ done: 4, total: 4 });
    expect(computeProgress(computeTabs(state({ leads: { pendingQuestions: 0, approvedQuestions: 0 } })))).toEqual({ done: 4, total: 4 });
    expect(computeProgress(computeTabs(state({ booth: null, contact: { hasContact: false } })))).toEqual({ done: 2, total: 3 });
  });
});

describe("„Co dalej?”", () => {
  it("najpierw zadanie z terminem, potem braki; najwyżej 2 karty", () => {
    const tasks = nextTasks(
      state({
        booth: booth(),
        profile: { draftStatus: null, hasLogo: false, hasDescription: true },
        contact: { hasContact: false },
      }),
    );
    expect(tasks.map((t) => [t.tab, t.title])).toEqual([
      ["stoisko", "Zgłoś zapotrzebowanie na stoisko — do 10 lis 2026, 23:59"],
      ["wizytowka", "Dodaj logo"],
    ]);
  });
  it("godziny do poprawy mają pierwszeństwo", () => {
    expect(nextTasks(state({ booth: booth({ hasRequest: true, timesNeedFix: true }) }))[0].title).toMatch(/Popraw godziny/);
  });
  it("wszystko gotowe → brak kart", () => {
    expect(nextTasks(state())).toEqual([]);
  });
  it("wizytówka czekająca na akceptację nie generuje zadań", () => {
    expect(nextTasks(state({ profile: { draftStatus: "pending", hasLogo: false, hasDescription: false } }))).toEqual([]);
  });
});
