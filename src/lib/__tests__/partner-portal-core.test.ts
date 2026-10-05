import { describe, it, expect } from "vitest";
import {
  accessStatus,
  changedProfileFields,
  maskEmail,
  normalizeEmail,
  normalizeUrl,
  parseSocialLinks,
  safeFileName,
  validateMaterialFile,
  validateProfileInput,
} from "../partner-portal-core";

describe("e-mail", () => {
  it("normalizacja i maskowanie", () => {
    expect(normalizeEmail("  Anna@Firma.PL ")).toBe("anna@firma.pl");
    expect(normalizeEmail("bez-malpy")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(maskEmail("anna@firma.pl")).toBe("a***@firma.pl");
  });
});

describe("status dostępu", () => {
  const now = Date.UTC(2026, 9, 5);
  const future = new Date(now + 86_400_000).toISOString();
  const past = new Date(now - 1).toISOString();
  it("unieważniony > aktywny > zaproszony/wygasły", () => {
    expect(accessStatus({ revoked_at: past, user_id: "u", invite_expires_at: future }, now)).toBe("revoked");
    expect(accessStatus({ revoked_at: null, user_id: "u", invite_expires_at: past }, now)).toBe("active");
    expect(accessStatus({ revoked_at: null, user_id: null, invite_expires_at: future }, now)).toBe("invited");
    expect(accessStatus({ revoked_at: null, user_id: null, invite_expires_at: past }, now)).toBe("expired");
  });
});

describe("URL-e", () => {
  it("tylko http(s), dopisuje https://", () => {
    expect(normalizeUrl("firma.pl")).toEqual({ ok: true, value: "https://firma.pl/" });
    expect(normalizeUrl("http://firma.pl/x")).toEqual({ ok: true, value: "http://firma.pl/x" });
    expect(normalizeUrl("")).toEqual({ ok: true, value: null });
    expect(normalizeUrl("javascript:alert(1)")).toEqual({ ok: false });
    expect(normalizeUrl("ftp://firma.pl")).toEqual({ ok: false });
    expect(normalizeUrl("localhost")).toEqual({ ok: false });
  });

  it("social z jsonb: tylko znane klucze i http(s)", () => {
    expect(parseSocialLinks({ linkedin: "https://linkedin.com/x", tiktok: "https://t", x: "javascript:1" })).toEqual({
      linkedin: "https://linkedin.com/x",
    });
    expect(parseSocialLinks(null)).toEqual({});
    expect(parseSocialLinks([1])).toEqual({});
  });
});

describe("profil", () => {
  const form = (v: Record<string, string>) => (k: string) => v[k] ?? null;

  it("waliduje i normalizuje", () => {
    const r = validateProfileInput(form({ name: " ACME ", website_url: "acme.pl", social_linkedin: "linkedin.com/company/acme", offer: "  " }));
    expect(r).toEqual({
      ok: true,
      profile: {
        name: "ACME",
        description: null,
        website_url: "https://acme.pl/",
        offer: null,
        social_links: { linkedin: "https://linkedin.com/company/acme" },
      },
    });
  });

  it("błędy", () => {
    expect(validateProfileInput(form({ name: "" }))).toMatchObject({ ok: false });
    expect(validateProfileInput(form({ name: "A", website_url: "javascript:x" }))).toMatchObject({ ok: false });
    expect(validateProfileInput(form({ name: "A", social_x: "data:text/html,1" }))).toMatchObject({ ok: false });
    expect(validateProfileInput(form({ name: "A", offer: "x".repeat(2001) }))).toMatchObject({ ok: false });
  });

  it("różnice szkic vs opublikowane", () => {
    const base = { name: "A", logo_url: null, description: "d", website_url: null, offer: null, social_links: { x: "https://x.com/a", linkedin: "https://l" } };
    expect(changedProfileFields(base, { ...base, social_links: { linkedin: "https://l", x: "https://x.com/a" } })).toEqual([]);
    expect(changedProfileFields(base, { ...base, name: "B", offer: "o" })).toEqual(["name", "offer"]);
  });
});

describe("pliki", () => {
  it("bezpieczna nazwa", () => {
    expect(safeFileName("../../Katalog Łódź 2026.pdf")).toBe("Katalog-Lodz-2026.pdf");
    expect(safeFileName("...")).toBe("plik");
  });

  it("typ i rozmiar materiału", () => {
    expect(validateMaterialFile({ type: "application/pdf", size: 100, name: "a.pdf" })).toEqual({ ok: true });
    expect(validateMaterialFile({ type: "application/x-msdownload", size: 100, name: "a.exe" })).toMatchObject({ ok: false });
    expect(validateMaterialFile({ type: "application/pdf", size: 6 * 1024 * 1024, name: "a.pdf" })).toMatchObject({ ok: false });
    expect(validateMaterialFile(null)).toMatchObject({ ok: false });
  });
});
