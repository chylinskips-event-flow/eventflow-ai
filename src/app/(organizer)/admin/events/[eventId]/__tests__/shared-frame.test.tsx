import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Etap 3: ekrany z podekranami na wspólnej ramie (PageShell + zakładki w `?tab=`).
// Mixer: „Plan” widoczny, ale nieaktywny w szkicu. Bilety: szeroki wariant ramy.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => ({ id: "ev1", organization_id: "org1" }) }));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));
vi.mock("@/lib/tickets", async (orig) => ({
  ...(await orig<typeof import("@/lib/tickets")>()),
  getTicketTypes: async () => [],
  getDiscountCodes: async () => [],
}));
vi.mock("../tickets/ticket-type-form", () => ({
  CreateTicketTypeButton: () => <button>Dodaj typ</button>,
  EditTicketTypeButton: () => null,
}));
vi.mock("../tickets/discount-code-form", () => ({ CreateDiscountCodeButton: () => <button>Dodaj kod</button> }));
vi.mock("../tickets/ticket-row-actions", () => ({
  TicketTypeToggle: () => null,
  DeleteTicketTypeButton: () => null,
  DeleteDiscountCodeButton: () => null,
}));

const { mixerTabs, enabledTabKeys, MIXER_DEFAULT_TAB } = await import("@/lib/organizer-tabs");
const { resolveTabKey } = await import("@/lib/url-tabs");
const { TabBar } = await import("@/components/tab-bar");
const { default: TicketsPage } = await import("../tickets/page");

describe("Business Mixer — zakładki", () => {
  it("w szkicu „Plan” jest widoczny i nieaktywny; ?tab=plan otwiera domyślną", () => {
    const tabs = mixerTabs({ status: "draft", activeCount: 4 });
    expect(tabs.map((t) => t.label)).toEqual(["Uczestnicy (4)", "Parametry", "Plan"]);
    expect(tabs.find((t) => t.key === "plan")?.disabled).toBe(true);
    expect(resolveTabKey("plan", enabledTabKeys(tabs), MIXER_DEFAULT_TAB)).toBe("uczestnicy");
  });

  it("po wygenerowaniu planu ?tab=plan otwiera Plan", () => {
    const tabs = mixerTabs({ status: "generated", activeCount: 4 });
    expect(tabs.every((t) => !t.disabled)).toBe(true);
    expect(resolveTabKey("plan", enabledTabKeys(tabs), MIXER_DEFAULT_TAB)).toBe("plan");
  });

  it("nieaktywna zakładka renderuje się jako wyłączony przycisk", () => {
    const html = renderToStaticMarkup(
      <TabBar
        tabs={mixerTabs({ status: "draft", activeCount: 0 })}
        active="uczestnicy"
        onSelect={() => {}}
        idPrefix="mixer"
        ariaLabel="Sekcje mixera"
      />,
    );
    const plan = html.match(/<button[^>]*id="mixer-tab-plan"[^>]*>/)![0];
    expect(plan).toContain("disabled");
    expect(plan).toContain('aria-disabled="true"');
    expect(plan).toContain('title="Plan będzie dostępny po wygenerowaniu"');
  });
});

describe("Bilety — wspólna rama", () => {
  async function render(tab?: string) {
    return renderToStaticMarkup(
      await TicketsPage({ params: Promise.resolve({ eventId: "ev1" }), searchParams: Promise.resolve({ tab }) }),
    );
  }

  it("tytuł, szeroka rama i dwie zakładki; domyślnie Typy biletów", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Bilety<\/h1>/);
    expect(html).toContain("max-w-5xl");
    expect(html).toMatch(/id="tickets-tab-typy"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="tickets-tab-kody"[^>]*aria-selected="false"/);
  });

  it("?tab=kody otwiera Kody rabatowe, a panel typów zostaje zamontowany (ukryty)", async () => {
    const html = await render("kody");
    expect(html).toMatch(/id="tickets-tab-kody"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="tickets-tabpanel-typy"[^>]*hidden/);
    expect(html).toContain("Dodaj typ");
    expect(html).toContain("Dodaj kod");
  });
});
