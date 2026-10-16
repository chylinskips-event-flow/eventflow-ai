import { describe, expect, it } from "vitest";
import { SLUG_MAX_LENGTH, sanitizeSlugInput, slugCandidate, slugFromName, slugify, validateSlug } from "@/lib/slug";

describe("slugify", () => {
  it("polskie znaki, w tym ł (NFKD go nie rozkłada)", () => {
    expect(slugify("Łódź")).toBe("lodz");
    expect(slugify("Zażółć gęślą jaźń")).toBe("zazolc-gesla-jazn");
    expect(slugify("Next Stop Łódź 2026")).toBe("next-stop-lodz-2026");
  });
  it("spacje i znaki specjalne → pojedynczy myślnik, bez myślników na brzegach", () => {
    expect(slugify("  Moja   Firma!!  ")).toBe("moja-firma");
    expect(slugify("A & B / C")).toBe("a-b-c");
    expect(slugify("--x--y--")).toBe("x-y");
  });
  it("inne litery spoza ASCII", () => {
    expect(slugify("Straße Øresund Æble")).toBe("strasse-oresund-aeble");
  });
  it("limit długości, bez myślnika na końcu po obcięciu", () => {
    const s = slugify(`${"a".repeat(62)} bbb`);
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(s.endsWith("-")).toBe(false);
  });
  it("nazwa bez liter łacińskich → pusty slug", () => {
    expect(slugify("Ивент")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});

describe("slugFromName / slugCandidate", () => {
  it("pusta lub nielatynowa nazwa → wartość zastępcza", () => {
    expect(slugFromName("", "organizacja")).toBe("organizacja");
    expect(slugFromName("Ивент", "organizacja")).toBe("organizacja");
    expect(slugFromName("Next Stop", "organizacja")).toBe("next-stop");
  });
  it("kolejne warianty: base, base-2, base-3…", () => {
    expect(slugCandidate("next-stop", 1)).toBe("next-stop");
    expect(slugCandidate("next-stop", 2)).toBe("next-stop-2");
    expect(slugCandidate("next-stop", 10)).toBe("next-stop-10");
  });
  it("wariant z numerem mieści się w limicie długości i jest poprawnym slugiem", () => {
    const base = "a".repeat(SLUG_MAX_LENGTH);
    const c = slugCandidate(base, 12);
    expect(c.length).toBe(SLUG_MAX_LENGTH);
    expect(c.endsWith("-12")).toBe(true);
    expect(validateSlug(c)).toBeNull();
    expect(validateSlug(slugCandidate(`${"a".repeat(59)}-bcd`, 2))).toBeNull();
  });
});

describe("sanitizeSlugInput (wpisywanie na bieżąco)", () => {
  it("pozwala wpisać myślnik na końcu (dopiero slugify go obcina)", () => {
    expect(sanitizeSlugInput("moj-")).toBe("moj-");
    expect(slugify(sanitizeSlugInput("moj-"))).toBe("moj");
  });
  it("wielkie litery, polskie znaki i spacje porządkowane od razu", () => {
    expect(sanitizeSlugInput("Targi Łódź ")).toBe("targi-lodz-");
    expect(sanitizeSlugInput(" -abc")).toBe("abc");
  });
});
