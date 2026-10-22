import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock("@/lib/email/send", () => ({
  sendAppEmail: async (p: { to: string; subject: string; html: string }) => void sent.push(p),
}));

const { buildAttendeeAccessLinkEmail, sendAttendeeAccessLinkEmail } = await import(
  "../email/attendee-access-link"
);

const entry = (over: Partial<Parameters<typeof buildAttendeeAccessLinkEmail>[0]["entries"][number]>) => ({
  firstName: "Ania",
  lastName: "Nowak",
  registeredAt: "1 października 2026",
  accessUrl: "https://eventro.pl/e/expo/a/tok",
  ...over,
});

beforeEach(() => {
  sent.length = 0;
});

describe("mail „Twój link do wydarzenia” (układ maili uczestnika)", () => {
  it("jeden rekord: temat, układ marki, przycisk, link awaryjny, escapowanie HTML", () => {
    const { subject, html } = buildAttendeeAccessLinkEmail({
      eventName: "Expo & Co",
      entries: [entry({ firstName: "<Łucja>" })],
    });
    expect(subject).toBe("Twój link do wydarzenia Expo & Co");
    expect(html).toContain("#4f46e5");
    expect(html).toContain("#f3f4f6"); // szare tło
    expect(html).toContain("Eventro · eventro.pl");
    expect(html).toContain("Expo &amp; Co");
    expect(html).toContain("Witaj, &lt;Łucja&gt;!");
    expect(html).toContain(">Otwórz mój panel<");
    expect(html).toContain("Jeśli przycisk nie działa");
    // przycisk + link awaryjny (href i tekst)
    expect(html.match(/https:\/\/eventro\.pl\/e\/expo\/a\/tok/g)).toHaveLength(3);
    expect(html).not.toContain("display: flex");
  });

  it("kilka rekordów: lista z imieniem, nazwiskiem, datą rejestracji i przyciskiem dla każdego", () => {
    const { subject, html } = buildAttendeeAccessLinkEmail({
      eventName: "Expo",
      entries: [
        entry({ firstName: "Jan", lastName: "Kowalski", registeredAt: "2 października 2026", accessUrl: "https://eventro.pl/e/expo/a/tok-2" }),
        entry({ firstName: "Ola", lastName: "Wiśniewska", registeredAt: "3 października 2026", accessUrl: "https://eventro.pl/e/expo/a/tok-3" }),
      ],
    });
    expect(subject).toBe("Twój link do wydarzenia Expo");
    expect(html).toContain("Jan Kowalski");
    expect(html).toContain("Ola Wiśniewska");
    expect(html).toContain("Rejestracja: 2 października 2026");
    expect(html).toContain("Rejestracja: 3 października 2026");
    expect(html.match(/>Otwórz panel</g)).toHaveLength(2);
    expect(html.match(/\/a\/tok-2/g)).toHaveLength(3);
    expect(html.match(/\/a\/tok-3/g)).toHaveLength(3);
  });

  it("dwa rekordy na jeden adres → jeden mail z dwoma linkami eventro.pl/e/<slug>/a/<token>", async () => {
    await sendAttendeeAccessLinkEmail({
      to: "biuro@example.com",
      eventName: "Expo",
      eventSlug: "expo",
      eventTimezone: "Europe/Warsaw",
      attendees: [
        { first_name: "Jan", last_name: "Kowalski", qr_code_token: "tok-2", created_at: "2026-10-02T09:00:00Z" },
        { first_name: "Ola", last_name: "Wiśniewska", qr_code_token: "tok-3", created_at: "2026-10-03T09:00:00Z" },
      ],
      origin: "https://eventro.pl",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("biuro@example.com");
    expect(sent[0].html).toContain("/e/expo/a/tok-2");
    expect(sent[0].html).toContain("/e/expo/a/tok-3");
    expect(sent[0].html).toContain("2026");
  });

  it("jeden rekord przez wysyłkę: link do panelu", async () => {
    await sendAttendeeAccessLinkEmail({
      to: "ania@example.com",
      eventName: "Expo",
      eventSlug: "expo",
      attendees: [{ first_name: null, last_name: null, qr_code_token: "tok-1", created_at: "2026-10-01T09:00:00Z" }],
      origin: "https://eventro.pl",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("/e/expo/a/tok-1");
    expect(sent[0].html).toContain("Witaj!");
  });
});
