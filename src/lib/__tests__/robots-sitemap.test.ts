import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// robots.txt: prywatne ścieżki (panel, API, linki z tokenem) wyłączone z indeksowania, strona
// wydarzenia dozwolona; sitemap: tylko strony marketingowe; subdomena wydarzenia serwuje robots.txt.

vi.mock("@/lib/supabase/middleware", () => ({
  isEventSuspended: async () => false,
  updateSession: async () => new Response(null, { headers: { "x-session": "1" } }),
}));

const { default: robots } = await import("../../app/robots");
const { default: sitemap } = await import("../../app/sitemap");
const { middleware } = await import("../../../middleware");
const { NextRequest } = await import("next/server");

// Uproszczone dopasowanie jak u Google: prefiks, * = dowolny ciąg, $ = koniec.
function blocked(path: string, disallow: string[]) {
  return disallow.some((rule) => {
    const anchored = rule.endsWith("$");
    const body = (anchored ? rule.slice(0, -1) : rule)
      .split("*")
      .map((part) => part.replace(/[.+?^(){}|[\]\\]/g, (c) => "\\" + c))
      .join(".*");
    return new RegExp("^" + body + (anchored ? "$" : "")).test(path);
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "eventro.pl");
});
afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  const disallowOf = () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    return [rules.disallow ?? []].flat();
  };

  it.each([
    "/admin",
    "/admin/events/1",
    "/onboarding",
    "/partner",
    "/partner/abc",
    "/partner/invite/tok",
    "/api/p24/webhook",
    "/auth/callback",
    "/g/tok",
    "/qa/tok",
    "/mod/tok",
    "/p/tok",
    "/e/konf/a/tok",
    "/e/konf/recepcja/tok",
    "/e/konf/posilek/tok",
    "/e/konf/booth/tok",
    "/e/konf/connect/kod",
    "/e/konf/checkout",
    "/a/tok",
    "/recepcja/tok",
    "/posilek/tok",
  ])("blokuje %s", (path) => {
    expect(blocked(path, disallowOf())).toBe(true);
  });

  it.each(["/", "/privacy", "/terms", "/e/konf", "/e/konf/agenda", "/e/konf/register", "/partners", "/agenda"])(
    "nie blokuje %s",
    (path) => {
      expect(blocked(path, disallowOf())).toBe(false);
    },
  );

  it("wskazuje sitemapę na adresie kanonicznym", () => {
    expect(robots().sitemap).toBe("https://eventro.pl/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  it("tylko strony marketingowe na adresie kanonicznym", () => {
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://eventro.pl",
      "https://eventro.pl/privacy",
      "https://eventro.pl/terms",
    ]);
  });

  it("bez NEXT_PUBLIC_ROOT_DOMAIN: NEXT_PUBLIC_APP_URL bez końcowego ukośnika", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example/");
    expect(sitemap()[0].url).toBe("https://app.example");
  });
});

describe("middleware: robots.txt na subdomenie wydarzenia", () => {
  it("nie przepisuje /robots.txt na /e/{slug}/robots.txt", async () => {
    const res = await middleware(new NextRequest("https://konf.eventro.pl/robots.txt", { headers: { host: "konf.eventro.pl" } }));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-session")).toBe("1");
  });

  it("inne ścieżki subdomeny nadal przepisuje na /e/{slug}", async () => {
    const res = await middleware(new NextRequest("https://konf.eventro.pl/agenda", { headers: { host: "konf.eventro.pl" } }));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://konf.eventro.pl/e/konf/agenda");
  });
});
