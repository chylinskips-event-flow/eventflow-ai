import { describe, expect, it } from "vitest";
import {
  LINK_RATE_WINDOW_MS,
  RATE_RETRY_MAX_ATTEMPTS,
  SIGNED_UPLOAD_TTL_MS,
  STALE_SWEEP_MS,
  STALE_UPLOAD_MS,
  linkRateRetryAfterMs,
  rateLimitRetryDelayMs,
  rateLimitWaitMessage,
} from "@/lib/gallery-core";

// Limit linku fotografa: kolejka w przeglądarce czeka i ponawia sama (zamiast błędów na resztę plików).

describe("linkRateRetryAfterMs", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");

  it("czas do wypadnięcia najstarszej rezerwacji z okna (+1 s zapasu)", () => {
    const oldest = new Date(now - 8 * 60 * 1000).toISOString();
    expect(linkRateRetryAfterMs(oldest, now)).toBe(2 * 60 * 1000 + 1000);
  });

  it("przedział [15 s, okno]; brak danych → całe okno", () => {
    expect(linkRateRetryAfterMs(new Date(now - LINK_RATE_WINDOW_MS + 100).toISOString(), now)).toBe(15_000);
    expect(linkRateRetryAfterMs(new Date(now + 60_000).toISOString(), now)).toBe(LINK_RATE_WINDOW_MS);
    expect(linkRateRetryAfterMs(null, now)).toBe(LINK_RATE_WINDOW_MS);
    expect(linkRateRetryAfterMs("bzdura", now)).toBe(LINK_RATE_WINDOW_MS);
  });
});

describe("rateLimitRetryDelayMs", () => {
  it("bez podpowiedzi serwera: narastająco 30 s, 60 s, 120 s…, najwyżej okno limitu", () => {
    expect(rateLimitRetryDelayMs(0)).toBe(30_000);
    expect(rateLimitRetryDelayMs(1)).toBe(60_000);
    expect(rateLimitRetryDelayMs(2)).toBe(120_000);
    expect(rateLimitRetryDelayMs(5)).toBe(LINK_RATE_WINDOW_MS);
  });

  it("podpowiedź serwera ma pierwszeństwo (min. 5 s, maks. okno)", () => {
    expect(rateLimitRetryDelayMs(0, 90_000)).toBe(90_000);
    expect(rateLimitRetryDelayMs(3, 1_000)).toBe(5_000);
    expect(rateLimitRetryDelayMs(0, 60 * 60 * 1000)).toBe(LINK_RATE_WINDOW_MS);
    expect(rateLimitRetryDelayMs(0, NaN)).toBe(30_000);
  });

  it("po wyczerpaniu prób → null (plik zostaje z „Ponów”)", () => {
    expect(rateLimitRetryDelayMs(RATE_RETRY_MAX_ATTEMPTS - 1)).not.toBeNull();
    expect(rateLimitRetryDelayMs(RATE_RETRY_MAX_ATTEMPTS)).toBeNull();
    expect(rateLimitRetryDelayMs(-1)).toBeNull();
  });

  it("łączny czas oczekiwania wystarcza na co najmniej jedno pełne okno limitu", () => {
    let total = 0;
    for (let a = 0; a < RATE_RETRY_MAX_ATTEMPTS; a++) total += rateLimitRetryDelayMs(a) ?? 0;
    expect(total).toBeGreaterThanOrEqual(LINK_RATE_WINDOW_MS);
  });
});

describe("rateLimitWaitMessage", () => {
  it("po polsku, sekundy lub minuty", () => {
    expect(rateLimitWaitMessage(30_000)).toBe("Limit wysyłki dla linku — automatyczne wznowienie za ok. 30 s. Nie zamykaj strony.");
    expect(rateLimitWaitMessage(125_000)).toContain("za ok. 3 min");
  });
});

describe("ważność podpisanego adresu a sprzątanie", () => {
  it("rezerwacje usuwamy dopiero po wygaśnięciu adresu wysyłki; budżet zwalniamy wcześniej", () => {
    expect(STALE_SWEEP_MS).toBeGreaterThan(SIGNED_UPLOAD_TTL_MS);
    expect(STALE_UPLOAD_MS).toBeLessThan(STALE_SWEEP_MS);
  });
});
