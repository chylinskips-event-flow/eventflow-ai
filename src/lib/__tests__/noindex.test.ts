import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

// Panele (organizator, prelegent) nie trafiają do wyszukiwarek: nagłówek X-Robots-Tag.

describe("noindex dla paneli", () => {
  it("/admin i /speaker (z podstronami) mają X-Robots-Tag: noindex", async () => {
    const rules = (await nextConfig.headers!()) ?? [];
    for (const source of ["/admin", "/admin/:path*", "/speaker", "/speaker/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
  });

  it("publiczne strony wydarzeń nie dostają globalnego noindex", async () => {
    const rules = (await nextConfig.headers!()) ?? [];
    expect(rules.some((r) => r.source.startsWith("/e/") || r.source === "/:path*")).toBe(false);
  });
});
