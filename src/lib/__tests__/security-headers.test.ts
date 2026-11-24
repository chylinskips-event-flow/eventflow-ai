import { describe, it, expect } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../../../next.config";

// Nagłówki bezpieczeństwa: nosniff i Referrer-Policy wszędzie, ochrona przed ramką z obcej
// domeny wszędzie poza ekranami rzutnika (/qa/{token}, /p/{token}). Dopasowanie ścieżek
// tym samym matcherem, którego Next używa dla `headers()`.

type Header = { key: string; value: string };

async function headersFor(pathname: string): Promise<Header[]> {
  const rules = (await nextConfig.headers!()) ?? [];
  return rules
    .filter((r) => getPathMatch(r.source, { removeUnnamedParams: true, strict: true })(pathname) !== false)
    .flatMap((r) => r.headers as Header[]);
}

const NOSNIFF = { key: "X-Content-Type-Options", value: "nosniff" };
const REFERRER = { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" };
const XFO = { key: "X-Frame-Options", value: "SAMEORIGIN" };
const CSP = { key: "Content-Security-Policy", value: "frame-ancestors 'self'" };

describe("nagłówki bezpieczeństwa", () => {
  it.each(["/", "/admin", "/admin/events/1/attendees", "/e/konf", "/e/konf/recepcja/tok", "/login", "/partner", "/mod/tok", "/g/tok"])(
    "%s: nosniff, Referrer-Policy i ochrona przed ramką",
    async (path) => {
      const h = await headersFor(path);
      expect(h).toContainEqual(NOSNIFF);
      expect(h).toContainEqual(REFERRER);
      expect(h).toContainEqual(XFO);
      expect(h).toContainEqual(CSP);
    },
  );

  it.each(["/qa/tok", "/p/tok"])("%s (ekran rzutnika): bez ochrony przed ramką, z nosniff", async (path) => {
    const h = await headersFor(path);
    expect(h).toContainEqual(NOSNIFF);
    expect(h).toContainEqual(REFERRER);
    expect(h.some((x) => x.key === "X-Frame-Options" || x.key === "Content-Security-Policy")).toBe(false);
  });

  it("CSP ogranicza tylko frame-ancestors (bez polityki skryptów)", async () => {
    const h = await headersFor("/");
    const csp = h.filter((x) => x.key === "Content-Security-Policy").map((x) => x.value);
    expect(csp).toEqual(["frame-ancestors 'self'"]);
  });

  it("noindex zostaje tylko na panelu, nie na stronie wydarzenia", async () => {
    expect(await headersFor("/admin")).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    expect((await headersFor("/e/konf")).some((x) => x.key === "X-Robots-Tag")).toBe(false);
  });
});
