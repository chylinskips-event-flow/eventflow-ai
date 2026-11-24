import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailConfigError, getFromAddress, normalizeFromAddress } from "@/lib/email/config";

describe("getFromAddress", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("zwraca wartość RESEND_FROM z nazwą wyświetlaną", () => {
    vi.stubEnv("RESEND_FROM", "Eventro <no-reply@eventro.pl>");
    expect(getFromAddress()).toBe("Eventro <no-reply@eventro.pl>");
  });

  it("akceptuje sam adres", () => {
    vi.stubEnv("RESEND_FROM", "no-reply@eventro.pl");
    expect(getFromAddress()).toBe("no-reply@eventro.pl");
  });

  it("zdejmuje cudzysłowy wklejone razem z wartością", () => {
    vi.stubEnv("RESEND_FROM", '"Eventro <no-reply@eventro.pl>"');
    expect(getFromAddress()).toBe("Eventro <no-reply@eventro.pl>");
  });

  it("brak zmiennej → błąd w logu i wyjątek, bez fallbacku na resend.dev (także poza produkcją)", () => {
    vi.stubEnv("RESEND_FROM", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => getFromAddress()).toThrow(EmailConfigError);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("RESEND_FROM is not set"));
  });

  it("zły format → wyjątek", () => {
    vi.stubEnv("RESEND_FROM", "Eventro");
    expect(() => getFromAddress()).toThrow(/invalid format/);
  });
});

describe("normalizeFromAddress", () => {
  it("przycina spacje i pojedyncze cudzysłowy", () => {
    expect(normalizeFromAddress("  'a@b.pl' ")).toBe("a@b.pl");
  });
});

describe("applyEmailRedirect (Preview)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("bez zmiennej: odbiorca i temat bez zmian", async () => {
    const { applyEmailRedirect } = await import("@/lib/email/config");
    expect(applyEmailRedirect("ola@example.com", "Bilet", { redirect: "", vercelEnv: undefined })).toEqual({
      to: "ola@example.com",
      subject: "Bilet",
    });
  });

  it("Preview bez zmiennej: wyjątek, nic nie wychodzi", async () => {
    const { applyEmailRedirect, EmailConfigError: Err } = await import("@/lib/email/config");
    expect(() => applyEmailRedirect("ola@example.com", "Bilet", { redirect: "", vercelEnv: "preview" })).toThrow(Err);
  });

  it("lokalnie (bez VERCEL_ENV) bez zmiennej: bez zmian", async () => {
    const { applyEmailRedirect } = await import("@/lib/email/config");
    expect(applyEmailRedirect("ola@example.com", "Bilet", { redirect: undefined, vercelEnv: undefined })).toEqual({ to: "ola@example.com", subject: "Bilet" });
  });

  it("Preview: mail na adres testowy, pierwotny odbiorca w temacie", async () => {
    const { applyEmailRedirect } = await import("@/lib/email/config");
    expect(applyEmailRedirect("ola@example.com", "Bilet", { redirect: " test@eventro.pl ", vercelEnv: "preview" })).toEqual({
      to: "test@eventro.pl",
      subject: "[Preview → ola@example.com] Bilet",
    });
  });

  it("produkcja: zmienna ignorowana", async () => {
    const { applyEmailRedirect } = await import("@/lib/email/config");
    expect(applyEmailRedirect("ola@example.com", "Bilet", { redirect: "test@eventro.pl", vercelEnv: "production" })).toEqual({
      to: "ola@example.com",
      subject: "Bilet",
    });
  });

  it("zły format adresu: wyjątek zamiast wysyłki", async () => {
    const { applyEmailRedirect, EmailConfigError: Err } = await import("@/lib/email/config");
    expect(() => applyEmailRedirect("ola@example.com", "Bilet", { redirect: "a@b.pl, c@d.pl", vercelEnv: "preview" })).toThrow(Err);
  });
});
