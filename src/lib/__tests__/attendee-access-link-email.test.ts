import { describe, it, expect, vi } from "vitest";

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock("@/lib/email/send", () => ({
  sendAppEmail: async (p: { to: string; subject: string; html: string }) => void sent.push(p),
}));

const { buildAttendeeAccessLinkEmail, sendAttendeeAccessLinkEmail } = await import(
  "../email/attendee-access-link"
);

describe("mail „Twój link do wydarzenia”", () => {
  it("temat, przycisk indigo, link awaryjny, escapowanie HTML", () => {
    const { subject, html } = buildAttendeeAccessLinkEmail({
      firstName: "<Ania>",
      eventName: "Expo & Co",
      accessUrl: "https://eventro.pl/e/expo/a/tok",
    });
    expect(subject).toBe("Twój link do wydarzenia Expo & Co");
    expect(html).toContain("#4f46e5");
    expect(html).toContain("Expo &amp; Co");
    expect(html).toContain("&lt;Ania&gt;");
    expect(html.match(/https:\/\/eventro\.pl\/e\/expo\/a\/tok/g)).toHaveLength(2);
  });

  it("wysyła na adres z rejestracji z linkiem eventro.pl/e/<slug>/a/<token>", async () => {
    await sendAttendeeAccessLinkEmail({
      to: "ania@example.com",
      firstName: null,
      eventName: "Expo",
      eventSlug: "expo",
      qrCodeToken: "tok-1",
      origin: "https://eventro.pl",
    });
    expect(sent[0].to).toBe("ania@example.com");
    expect(sent[0].html).toContain("/e/expo/a/tok-1");
  });
});
