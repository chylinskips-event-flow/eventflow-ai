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
  body_mode: "structured" | "html";
  body_heading: string | null;
  body_main: string | null;
  body_footer: string | null;
};

type DefaultTemplate = {
  subject: string | null;
  body_heading: string | null;
  body_main: string | null;
  body_footer: string | null;
};

export const DEFAULT_TEMPLATES: Record<MessageTemplateType, DefaultTemplate> = {
  registration_confirmed: {
    subject: "Potwierdzenie rejestracji – {nazwa_eventu}",
    body_heading: "Witaj, {imię}!",
    body_main: "Twoja rejestracja na {nazwa_eventu} została potwierdzona.",
    body_footer: "Pokaż ten kod przy wejściu na wydarzenie.",
  },

  registration_pending: {
    subject: "Zgłoszenie oczekuje na zatwierdzenie – {nazwa_eventu}",
    body_heading: "Witaj, {imię}!",
    body_main:
      "Otrzymaliśmy Twoje zgłoszenie na {nazwa_eventu}.\n\n" +
      "Organizator musi jeszcze zatwierdzić Twoją rejestrację. " +
      "Gdy to się stanie, otrzymasz kolejny email z dostępem i kodem QR.",
    body_footer: null,
  },

  registration_approved: {
    subject: "Potwierdzenie rejestracji – {nazwa_eventu}",
    body_heading: "Witaj, {imię}!",
    body_main: "Twoja rejestracja na {nazwa_eventu} została potwierdzona.",
    body_footer: "Pokaż ten kod przy wejściu na wydarzenie.",
  },

  registration_rejected: {
    subject: "Rejestracja nie została zatwierdzona – {nazwa_eventu}",
    body_heading: "Witaj, {imię}.",
    body_main:
      "Niestety Twoja rejestracja na {nazwa_eventu} " +
      "nie została zatwierdzona przez organizatora.",
    body_footer: null,
  },

  welcome_approved: {
    subject: null,
    body_heading: null,
    body_main: "{imię}, cieszymy się, że będziesz z nami na {nazwa_eventu}.",
    body_footer: null,
  },

  welcome_pending: {
    subject: null,
    body_heading: null,
    body_main:
      "Dziękujemy za zgłoszenie! Twoja rejestracja na {nazwa_eventu} " +
      "oczekuje na zatwierdzenie przez organizatora. " +
      "Otrzymasz email, gdy zostanie zaakceptowana.",
    body_footer: null,
  },
};

const HAS_QR = new Set<MessageTemplateType>([
  "registration_confirmed",
  "registration_approved",
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildStructuredHtml(
  type: MessageTemplateType,
  heading: string | null,
  main: string | null,
  footer: string | null,
): string {
  if (type.startsWith("welcome_")) {
    return main ?? "";
  }

  const headingHtml = heading
    ? `<h1 style="font-size: 20px;">${escapeHtml(heading)}</h1>`
    : "";

  const mainHtml = (main ?? "")
    .split("\n\n")
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n  ");

  if (HAS_QR.has(type)) {
    const footerHtml = footer ? `\n  <p>${escapeHtml(footer)}</p>` : "";
    return `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
  ${headingHtml}
  ${mainHtml}
  <p style="margin-top: 24px;">
    <img src="cid:qr-code" alt="Twój kod QR" width="200" height="200" />
  </p>${footerHtml}
  <p style="font-size: 13px; color: #666;">
    Jeśli kod się nie wyświetla, użyj tego linku:<br />
    <a href="{link_dostępu}">{link_dostępu}</a>
  </p>
</div>`;
  }

  return `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
  ${headingHtml}
  ${mainHtml}
</div>`;
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
    .select("subject, body, body_mode, body_heading, body_main, body_footer")
    .eq("event_id", eventId)
    .eq("template_type", type)
    .maybeSingle();

  if (data) {
    const body =
      (data.body_mode as string) === "structured"
        ? buildStructuredHtml(
            type,
            data.body_heading as string | null,
            data.body_main as string | null,
            data.body_footer as string | null,
          )
        : (data.body as string);
    return {
      subject: data.subject as string | null,
      body,
      body_mode: data.body_mode as "structured" | "html",
      body_heading: data.body_heading as string | null,
      body_main: data.body_main as string | null,
      body_footer: data.body_footer as string | null,
    };
  }

  const def = DEFAULT_TEMPLATES[type];
  return {
    subject: def.subject,
    body: buildStructuredHtml(type, def.body_heading, def.body_main, def.body_footer),
    body_mode: "structured",
    body_heading: def.body_heading,
    body_main: def.body_main,
    body_footer: def.body_footer,
  };
}
