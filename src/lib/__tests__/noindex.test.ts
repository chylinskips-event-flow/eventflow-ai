import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

// Panel organizatora, linki z tokenem i strony wydarzenia z tokenem nie trafiają do wyszukiwarek:
// nagłówek X-Robots-Tag. Publiczne strony wydarzenia pozostają indeksowalne.

// Uproszczone dopasowanie źródeł z next.config: :param = jeden segment, /:param* = dowolna reszta.
function matches(source: string, path: string) {
  const re = source
    .replace(/[.+?^(){}|[\]\\]/g, (c) => "\\" + c)
    .replace(/\/:\w+\*/g, "(?:/.*)?")
    .replace(/:\w+/g, "[^/]+");
  return new RegExp("^" + re + "$").test(path);
}

async function noindexed(path: string) {
  const rules = (await nextConfig.headers!()) ?? [];
  return rules.some(
    (r) =>
      matches(r.source, path) &&
      r.headers.some((h) => h.key === "X-Robots-Tag" && h.value === "noindex, nofollow"),
  );
}

describe("noindex (X-Robots-Tag)", () => {
  it("/admin (z podstronami) ma X-Robots-Tag: noindex", async () => {
    const rules = (await nextConfig.headers!()) ?? [];
    for (const source of ["/admin", "/admin/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
  });

  it.each([
    "/admin/events/1",
    "/g/tok",
    "/e/konf/a/tok",
    "/e/konf/a/status",
    "/e/konf/recepcja/tok",
    "/e/konf/posilek/tok",
    "/e/konf/booth/tok",
    "/e/konf/connect/kod",
    "/e/konf/checkout",
    "/e/konf/checkout/success",
    // subdomena wydarzenia: nagłówki dopasowywane do ścieżki przed przepisaniem na /e/{slug}
    "/a/tok",
    "/recepcja/tok",
    "/posilek/tok",
    "/booth/tok",
    "/connect/kod",
    "/checkout",
    "/checkout/return",
  ])("%s ma noindex", async (path) => {
    expect(await noindexed(path)).toBe(true);
  });

  it.each([
    "/",
    "/privacy",
    "/e/konf",
    "/e/konf/agenda",
    "/e/konf/agenda/123",
    "/e/konf/register",
    "/e/konf/speakers",
    "/e/konf/partners",
    "/agenda",
    "/register",
  ])("publiczna strona %s nie dostaje noindex", async (path) => {
    expect(await noindexed(path)).toBe(false);
  });
});
