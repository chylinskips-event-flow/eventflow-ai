import { describe, expect, it } from "vitest";
import { failedLoginRedirectPath, isPartnerPath, safeNextPath } from "@/lib/auth-callback";

// /auth/callback: nieudany link logowania partnera wraca na logowanie partnera (z komunikatem),
// a `next` przyjmuje wyłącznie ścieżki tej samej domeny.

describe("failedLoginRedirectPath", () => {
  it("partner (zaproszenie i logowanie partnera mają next=/partner) → logowanie partnera z komunikatem", () => {
    expect(failedLoginRedirectPath("/partner")).toBe("/partner/login?error=link");
    expect(failedLoginRedirectPath("/partner/abc")).toBe("/partner/login?error=link");
  });

  it("organizator lub brak next → logowanie organizatora", () => {
    expect(failedLoginRedirectPath("/admin")).toBe("/login");
    expect(failedLoginRedirectPath(null)).toBe("/login");
    expect(failedLoginRedirectPath("/partnerzy")).toBe("/login");
  });
});

describe("safeNextPath", () => {
  it("zostawia ścieżki tej samej domeny", () => {
    expect(safeNextPath("/partner")).toBe("/partner");
    expect(safeNextPath("/admin/events/1?tab=x")).toBe("/admin/events/1?tab=x");
  });

  it("odrzuca adresy prowadzące poza domenę", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "@evil.example", "/x@evil", "", null, undefined]) {
      expect(safeNextPath(bad)).toBe("/admin");
    }
  });

  it("isPartnerPath", () => {
    expect(isPartnerPath("/partner")).toBe(true);
    expect(isPartnerPath("/partner/login")).toBe(true);
    expect(isPartnerPath("/admin")).toBe(false);
  });
});
