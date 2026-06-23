import { createAdminClient } from "@/lib/supabase/admin";

export type MessageTemplateType =
  | "registration_confirmed"
  | "registration_pending"
  | "registration_approved"
  | "registration_rejected"
  | "welcome_approved"
  | "welcome_pending";

export type MessageTemplate = {
  subject: string | null;
  body: string;
};

export const DEFAULT_TEMPLATES: Record<MessageTemplateType, MessageTemplate> = {
  registration_confirmed: {
    subject: "Potwierdzenie rejestracji — {nazwa_eventu}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
  <h1 style="font-size: 20px;">Witaj, {imię}!</h1>
  <p>Twoja rejestracja na <strong>{nazwa_eventu}</strong> została potwierdzona.</p>
  <p style="margin-top: 24px;">
    <img src="cid:qr-code" alt="Twój kod QR" width="200" height="200" />
  </p>
  <p>Pokaż ten kod przy wejściu na wydarzenie.</p>
  <p style="font-size: 13px; color: #666;">
    Jeśli kod się nie wyświetla, użyj tego linku:<br />
    <a href="{link_dostępu}">{link_dostępu}</a>
  </p>
</div>`,
  },

  registration_pending: {
    subject: "Zgłoszenie oczekuje na zatwierdzenie — {nazwa_eventu}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
  <h1 style="font-size: 20px;">Witaj, {imię}!</h1>
  <p>Otrzymaliśmy Twoje zgłoszenie na <strong>{nazwa_eventu}</strong>.</p>
  <p>Organizator musi jeszcze zatwierdzić Twoją rejestrację. Gdy to się stanie,
  otrzymasz kolejny email z dostępem i kodem QR.</p>
</div>`,
  },

  registration_approved: {
    subject: "Potwierdzenie rejestracji — {nazwa_eventu}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
  <h1 style="font-size: 20px;">Witaj, {imię}!</h1>
  <p>Twoja rejestracja na <strong>{nazwa_eventu}</strong> została potwierdzona.</p>
  <p style="margin-top: 24px;">
    <img src="cid:qr-code" alt="Twój kod QR" width="200" height="200" />
  </p>
  <p>Pokaż ten kod przy wejściu na wydarzenie.</p>
  <p style="font-size: 13px; color: #666;">
    Jeśli kod się nie wyświetla, użyj tego linku:<br />
    <a href="{link_dostępu}">{link_dostępu}</a>
  </p>
</div>`,
  },

  registration_rejected: {
    subject: "Rejestracja nie została zatwierdzona — {nazwa_eventu}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
  <h1 style="font-size: 20px;">Witaj, {imię}.</h1>
  <p>Niestety Twoja rejestracja na <strong>{nazwa_eventu}</strong> nie została zatwierdzona przez organizatora.</p>
</div>`,
  },

  welcome_approved: {
    subject: null,
    body: "{imię}, cieszymy się, że będziesz z nami na {nazwa_eventu}.",
  },

  welcome_pending: {
    subject: null,
    body: "Dziękujemy za zgłoszenie! Twoja rejestracja na {nazwa_eventu} oczekuje na zatwierdzenie przez organizatora. Otrzymasz email, gdy zostanie zaakceptowana.",
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyVariables(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce((result, [key, raw]) => {
    const safe = escapeHtml(raw);
    return result.replace(new RegExp(`\\{${key}\\}`, "g"), () => safe);
  }, template);
}

export async function getTemplate(
  eventId: string,
  type: MessageTemplateType,
): Promise<MessageTemplate> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("event_message_templates")
    .select("subject, body")
    .eq("event_id", eventId)
    .eq("template_type", type)
    .maybeSingle();

  if (data) {
    return { subject: data.subject, body: data.body };
  }

  return DEFAULT_TEMPLATES[type];
}
