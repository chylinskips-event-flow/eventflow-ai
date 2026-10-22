import { describe, it, expect, vi, beforeEach } from "vitest";

// Mail potwierdzenia rejestracji: QR inline (Content-ID zgodny z szablonem), jeden załącznik,
// przycisk do panelu, link awaryjny, układ marki, polskie znaki, bez placeholderów.

type Attachment = { filename: string; content: Buffer; contentId?: string };
const sent: { to: string; subject: string; html: string; attachments?: Attachment[] }[] = [];
const ctx = { customTemplate: null as null | Record<string, unknown> };

vi.mock("@/lib/email/send", () => ({
  sendAppEmail: async (p: (typeof sent)[number]) => void sent.push(p),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const b = {
      select: () => b,
      eq: () => b,
      maybeSingle: async () => ({ data: ctx.customTemplate, error: null }),
    };
    return { from: () => b };
  },
}));

const { sendAttendeeConfirmationEmail } = await import("../email/attendee-confirmation");

const event = { id: "ev1", slug: "next-stop", name: "Next Stop Łódź" } as never;

beforeEach(() => {
  sent.length = 0;
  ctx.customTemplate = null;
});

async function send(over: Record<string, unknown> = {}) {
  await sendAttendeeConfirmationEmail({
    to: "ania@example.com",
    firstName: "Łucja",
    event,
    qrCodeToken: "qr-tok",
    checkInToken: "ci-tok",
    origin: "https://eventro.pl",
    ...over,
  });
  return sent[0];
}

describe("mail potwierdzenia rejestracji", () => {
  it("QR jest obrazem inline z jedynego załącznika (cid zgodny)", async () => {
    const mail = await send();
    expect(mail.attachments).toHaveLength(1);
    const [att] = mail.attachments!;
    expect(att.contentId).toBe("qr-code");
    expect(att.filename).toMatch(/\.png$/);
    expect(att.content.subarray(1, 4).toString()).toBe("PNG");
    expect(mail.html).toContain(`src="cid:${att.contentId}"`);
  });

  it("treść: nagłówek z nazwą wydarzenia, powitanie, przycisk, link awaryjny, stopka marki", async () => {
    const mail = await send();
    expect(mail.subject).toBe("Potwierdzenie rejestracji – Next Stop Łódź");
    expect(mail.html).toContain("Next Stop Łódź");
    expect(mail.html).toContain("Witaj, Łucja!");
    expect(mail.html).toContain("Pokaż ten kod przy wejściu");
    expect(mail.html).toContain(">Otwórz mój panel<");
    expect(mail.html).toContain("Jeśli przycisk nie działa");
    expect(mail.html).toContain("Eventro · eventro.pl");
    expect(mail.html).toContain("#4f46e5");
    // przycisk + link awaryjny (href + tekst) → eventro.pl/e/{slug}/a/{token}
    expect(mail.html.match(/https:\/\/eventro\.pl\/e\/next-stop\/a\/qr-tok/g)).toHaveLength(3);
  });

  it("bez placeholderów i niepodstawionych zmiennych, bez flexboxa", async () => {
    const mail = await send();
    expect(mail.html).not.toMatch(/\[[^\]]*\]/);
    expect(mail.html).not.toMatch(/\{(imię|nazwa_eventu|link_dostępu)\}/);
    expect(mail.html).not.toContain("display: flex");
  });

  it("zatwierdzenie przez organizatora korzysta z tego samego układu", async () => {
    const mail = await send({ templateType: "registration_approved" });
    expect(mail.html).toContain('src="cid:qr-code"');
    expect(mail.html).toContain(">Otwórz mój panel<");
  });

  it("własny szablon HTML organizatora z cid:qr-code też dostaje obraz", async () => {
    ctx.customTemplate = {
      subject: "Bilet",
      body: '<p>Twój kod:</p><img src="cid:qr-code" alt="Kod QR" />',
      body_mode: "html",
      body_heading: null,
      body_main: null,
      body_footer: null,
    };
    const mail = await send();
    expect(mail.html).toContain('src="cid:qr-code"');
    expect(mail.attachments?.[0].contentId).toBe("qr-code");
  });
});
