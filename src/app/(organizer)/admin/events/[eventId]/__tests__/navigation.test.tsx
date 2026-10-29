import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Nawigacja panelu wydarzenia: menu w sekcjach (etykiety i adresy bez zmian), nagłówek w jednym
// rzędzie oraz neutralna linia subdomeny bez „Ponów”, gdy subdomena jest celowo nieaktywna.

const nav = { pathname: "/admin/events/ev1/engagement" };

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/logo", () => ({ Logo: () => null }));
vi.mock("../actions", () => ({ retrySubdomain: async () => "error" }));
vi.mock("../../../../actions", () => ({ signOut: async () => {} }));
vi.mock("@/lib/events", () => ({
  getOwnEvent: async () => ({
    name: "Next Stop Łódź",
    status: "published",
    slug: "next-stop",
    gamification_enabled: true,
    lottery_points_per_ticket: 10,
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/request-origin", () => ({ getOrigin: () => "https://eventro.pl" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

const { EventSidebar, buildNavSections } = await import("../event-sidebar");
const { SubdomainStatus } = await import("../subdomain-status");
const { default: EventLayout } = await import("../layout");

const base = "/admin/events/ev1";

describe("menu wydarzenia w sekcjach", () => {
  it("sekcje i kolejność pozycji jak w briefie; Loteria i Nagrody w Zaangażowaniu", () => {
    const sections = buildNavSections(base, { gamificationEnabled: true, hasLottery: true });
    expect(sections.map((s) => [s.label, s.items.map((i) => i.label)])).toEqual([
      ["Przygotowanie", ["Ustawienia", "Treść", "Prelegenci", "Agenda", "Bilety"]],
      ["Ludzie i partnerzy", ["Uczestnicy", "Partnerzy"]],
      ["Dzień eventu", ["Recepcja", "Prowadzący", "Q&A i ankiety", "Komunikaty", "Galeria"]],
      ["Zaangażowanie", ["Questy", "Nagrody", "Loteria", "Business Mixer"]],
      ["Rozliczenia", ["Płatności"]],
    ]);
  });

  it("adresy bez zmian; bez grywalizacji nie ma Nagród ani Loterii", () => {
    const hrefs = buildNavSections(base, { gamificationEnabled: false, hasLottery: false })
      .flatMap((s) => s.items.map((i) => i.href))
      .sort();
    expect(hrefs).toEqual(
      [
        base,
        `${base}/attendees`,
        `${base}/content`,
        `${base}/engagement`,
        `${base}/gallery`,
        `${base}/messages`,
        `${base}/mixer`,
        `${base}/moderator`,
        `${base}/partners`,
        `${base}/payments`,
        `${base}/quests`,
        `${base}/reception`,
        `${base}/sessions`,
        `${base}/speakers`,
        `${base}/tickets`,
      ].sort(),
    );
  });

  it("etykiety sekcji to nagłówki powiązane z listami; aktywna pozycja ma aria-current", () => {
    nav.pathname = `${base}/engagement/abc`;
    const html = renderToStaticMarkup(
      <EventSidebar eventId="ev1" gamificationEnabled hasLottery={false} userEmail={null} signOut={async () => {}} />,
    );
    expect(html).toMatch(/<h2 id="nav-desktop-event-day"[^>]*>Dzień eventu<\/h2>/);
    expect(html).toContain('aria-labelledby="nav-desktop-event-day"');
    const current = html.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain(`href="${base}/engagement"`);
  });

  it("Ustawienia aktywne tylko na stronie głównej wydarzenia", () => {
    nav.pathname = base;
    const html = renderToStaticMarkup(
      <EventSidebar eventId="ev1" gamificationEnabled={false} hasLottery={false} userEmail={null} signOut={async () => {}} />,
    );
    const current = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current).toEqual([expect.stringContaining(`href="${base}"`)]);
  });
});

describe("nagłówek wydarzenia", () => {
  it("jeden rząd o stałej wysokości h-14, nazwa i status w jednej linii, etykiety przycisków tylko od sm", async () => {
    const html = renderToStaticMarkup(
      await EventLayout({ children: <p>treść</p>, params: Promise.resolve({ eventId: "ev1" }) }),
    );
    const header = html.match(/<header[^>]*data-workspace-header[^>]*>/)![0];
    expect(header).toContain("h-14");
    expect(header).not.toContain("flex-wrap");
    expect(html).toContain("Next Stop Łódź");
    expect(html).toContain("Opublikowany");
    expect(html).toContain('<span class="max-sm:sr-only">Podgląd</span>');
    expect(html).toContain('<span class="max-sm:sr-only">Udostępnij</span>');
  });
});

describe("linia subdomeny", () => {
  it("celowo nieaktywna: neutralne wyjaśnienie, bez „nieaktywna” i bez „Ponów”", () => {
    const html = renderToStaticMarkup(<SubdomainStatus eventId="ev1" slug="next-stop" initialState="unknown" />);
    expect(html).toContain("Dodatkowy adres (subdomena) nie jest aktywny – strona działa pod");
    expect(html).toContain("eventro.pl/e/next-stop");
    expect(html).not.toContain("Ponów");
    expect(html).not.toContain("nieaktywna");
  });

  it("błąd rejestracji: zostaje status i „Ponów”", () => {
    const html = renderToStaticMarkup(<SubdomainStatus eventId="ev1" slug="next-stop" initialState="error" />);
    expect(html).toContain("nieaktywna");
    expect(html).toContain("Ponów");
  });
});
