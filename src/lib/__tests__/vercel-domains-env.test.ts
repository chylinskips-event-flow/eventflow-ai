import { describe, expect, it } from "vitest";
import { vercelDomainsConfigured } from "@/lib/vercel-domains";

// Preview ma osobną bazę: jego wydarzenia nie mogą zarządzać domenami produkcyjnego projektu.
describe("vercelDomainsConfigured", () => {
  const keys = { VERCEL_API_TOKEN: "t", VERCEL_PROJECT_ID: "p" };

  it("produkcja z tokenem i projektem: włączone", () => {
    expect(vercelDomainsConfigured({ ...keys, VERCEL_ENV: "production" })).toBe(true);
  });

  it("Preview i development: wyłączone mimo tokenu", () => {
    expect(vercelDomainsConfigured({ ...keys, VERCEL_ENV: "preview" })).toBe(false);
    expect(vercelDomainsConfigured({ ...keys, VERCEL_ENV: "development" })).toBe(false);
  });

  it("brak tokenu lub projektu: wyłączone", () => {
    expect(vercelDomainsConfigured({ VERCEL_PROJECT_ID: "p", VERCEL_ENV: "production" })).toBe(false);
    expect(vercelDomainsConfigured({ VERCEL_API_TOKEN: "t" })).toBe(false);
  });
});
