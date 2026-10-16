import { describe, expect, it } from "vitest";
import { resolveTabKey, tabFromHash, urlForTab } from "@/lib/url-tabs";
import { SETTINGS_DEFAULT_TAB, SETTINGS_TAB_KEYS, partnerDetailTabs, type PartnerDetailState } from "@/lib/organizer-tabs";

describe("?tab= w adresie", () => {
  it("widoczna zakładka → ta zakładka", () => {
    expect(resolveTabKey("branding", SETTINGS_TAB_KEYS, SETTINGS_DEFAULT_TAB)).toBe("branding");
    expect(resolveTabKey(["identyfikatory", "x"], SETTINGS_TAB_KEYS, SETTINGS_DEFAULT_TAB)).toBe("identyfikatory");
  });
  it("nieznana, pusta albo ukryta wartość → domyślna", () => {
    expect(resolveTabKey("cokolwiek", SETTINGS_TAB_KEYS, SETTINGS_DEFAULT_TAB)).toBe("ogolne");
    expect(resolveTabKey(undefined, SETTINGS_TAB_KEYS, SETTINGS_DEFAULT_TAB)).toBe("ogolne");
    expect(resolveTabKey("leady", ["wizytowka", "stoisko"], "wizytowka")).toBe("wizytowka");
  });
  it("adres po zmianie zakładki: domyślna bez parametru, stara kotwica usunięta", () => {
    expect(urlForTab("https://x.pl/admin/events/1?tab=branding#branding", "ogolne", "ogolne")).toBe("https://x.pl/admin/events/1");
    expect(urlForTab("https://x.pl/admin/events/1", "branding", "ogolne")).toBe("https://x.pl/admin/events/1?tab=branding");
  });
});

describe("stare linki z kotwicą", () => {
  it("#branding (dawna sekcja ustawień) → zakładka", () => {
    expect(tabFromHash("#branding", SETTINGS_TAB_KEYS)).toBe("branding");
    expect(tabFromHash("#strefa-niebezpieczna", SETTINGS_TAB_KEYS)).toBe("strefa-niebezpieczna");
  });
  it("#stoisko z maila do organizatora → zakładka „Stoisko”", () => {
    expect(tabFromHash("#stoisko", ["wizytowka", "stoisko"])).toBe("stoisko");
  });
  it("nieznana kotwica albo ukryta zakładka → brak zmiany", () => {
    expect(tabFromHash("#nic", SETTINGS_TAB_KEYS)).toBeNull();
    expect(tabFromHash("", SETTINGS_TAB_KEYS)).toBeNull();
    expect(tabFromHash("#leady", ["wizytowka", "stoisko"])).toBeNull();
  });
  it("aliasy kotwic", () => {
    expect(tabFromHash("#zapotrzebowanie", ["wizytowka", "stoisko"], { zapotrzebowanie: "stoisko" })).toBe("stoisko");
  });
});

describe("szczegóły partnera — zakładki", () => {
  const base: PartnerDetailState = { draftPending: false, pendingMaterials: 0, pendingBoothItems: 0, leads: null };
  const keys = (s: PartnerDetailState) => partnerDetailTabs(s).tabs.map((t) => t.key);

  it("bez Fazy B (flaga/bramka wyłączona) nie ma zakładki „Leady”", () => {
    expect(keys(base)).toEqual(["wizytowka", "materialy", "stoisko", "kontakt", "dostep"]);
  });
  it("„Leady” tylko przy włączonej funkcji", () => {
    expect(keys({ ...base, leads: { pendingQuestions: 0 } })).toEqual(["wizytowka", "materialy", "stoisko", "leady", "kontakt", "dostep"]);
  });
  it("znacznik ● przy zakładkach z czymś do akceptacji", () => {
    const { tabs } = partnerDetailTabs({ ...base, pendingMaterials: 2, pendingBoothItems: 3 });
    expect(tabs.find((t) => t.key === "materialy")?.mark?.label).toBe("do akceptacji: 2");
    expect(tabs.find((t) => t.key === "stoisko")?.mark?.label).toBe("do akceptacji: 3");
    expect(tabs.find((t) => t.key === "wizytowka")?.mark).toBeNull();
  });
  it("domyślna = pierwsza zakładka z czymś do akceptacji, inaczej Wizytówka", () => {
    expect(partnerDetailTabs(base).defaultTab).toBe("wizytowka");
    expect(partnerDetailTabs({ ...base, pendingBoothItems: 1 }).defaultTab).toBe("stoisko");
    expect(partnerDetailTabs({ ...base, draftPending: true, pendingBoothItems: 1 }).defaultTab).toBe("wizytowka");
    expect(partnerDetailTabs({ ...base, leads: { pendingQuestions: 1 } }).defaultTab).toBe("leady");
  });
  it("błąd wczytania logistyki: zakładka „Stoisko” jest, bez znacznika", () => {
    const { tabs } = partnerDetailTabs({ ...base, pendingBoothItems: null });
    expect(tabs.find((t) => t.key === "stoisko")?.mark).toBeNull();
  });
});
