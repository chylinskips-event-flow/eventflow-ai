import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEventApexUrl, buildEventBasePath, buildEventInternalPath } from "@/lib/event-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildEventApexUrl", () => {
  it("z NEXT_PUBLIC_ROOT_DOMAIN zwraca adres apex /e/<slug>, nie subdomenę", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "eventro.pl");
    expect(buildEventApexUrl("nextstoplodz", "https://eventro.pl")).toBe(
      "https://eventro.pl/e/nextstoplodz",
    );
  });

  it("ignoruje origin subdomeny i zawsze wskazuje apex", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "eventro.pl");
    expect(buildEventApexUrl("nextstoplodz", "https://nextstoplodz.eventro.pl")).toBe(
      "https://eventro.pl/e/nextstoplodz",
    );
  });

  it("bez NEXT_PUBLIC_ROOT_DOMAIN używa origin (dev/preview)", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "");
    expect(buildEventApexUrl("nextstoplodz", "http://localhost:3000")).toBe(
      "http://localhost:3000/e/nextstoplodz",
    );
    expect(
      buildEventApexUrl("nextstoplodz", "https://eventflow-ai-git-x.vercel.app"),
    ).toBe("https://eventflow-ai-git-x.vercel.app/e/nextstoplodz");
  });

  it("pozwala dokleić ścieżkę (QR kontaktu)", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "eventro.pl");
    expect(`${buildEventApexUrl("nextstoplodz", "https://eventro.pl")}/connect/ABC123`).toBe(
      "https://eventro.pl/e/nextstoplodz/connect/ABC123",
    );
  });
});

describe("buildEventBasePath / buildEventInternalPath", () => {
  it("na subdomenie wydarzenia zwraca ścieżkę bez prefiksu", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "eventro.pl");
    expect(buildEventBasePath("nextstoplodz", "https://nextstoplodz.eventro.pl")).toBe("");
    expect(
      buildEventInternalPath("nextstoplodz", "/register", "https://nextstoplodz.eventro.pl"),
    ).toBe("/register");
  });

  it("na apex zwraca /e/<slug>", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "eventro.pl");
    expect(buildEventInternalPath("nextstoplodz", "/register", "https://eventro.pl")).toBe(
      "/e/nextstoplodz/register",
    );
  });
});
