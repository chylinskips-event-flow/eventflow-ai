import { BRAND_NAME } from "@/lib/brand";
import { sendAppEmail } from "@/lib/email/send";
import { buildEventApexUrl } from "@/lib/event-url";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAttendeeAccessUrl(slug: string, qrCodeToken: string, origin: string): string {
  return `${buildEventApexUrl(slug, origin)}/a/${qrCodeToken}`;
}

export function buildAttendeeAccessLinkEmail(params: {
  firstName: string | null;
  eventName: string;
  accessUrl: string;
}): { subject: string; html: string } {
  const event = escapeHtml(params.eventName);
  const url = escapeHtml(params.accessUrl);
  const greeting = params.firstName?.trim() ? `Cześć ${escapeHtml(params.firstName.trim())},` : "Cześć,";
  const html = `<div style="font-family: system-ui, sans-serif; max-width: 560px; line-height: 1.5;">
  <h1 style="font-size: 20px;">${event}</h1>
  <p>${greeting}</p>
  <p>ktoś (prawdopodobnie Ty) poprosił o link do Twojego panelu uczestnika wydarzenia <strong>${event}</strong>. Otwórz go na urządzeniu, którego chcesz używać na wydarzeniu.</p>
  <p style="margin: 24px 0;"><a href="${url}" style="background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">Otwórz panel uczestnika</a></p>
  <p style="font-size: 13px; color: #666;">To ten sam osobisty link, który przyszedł w mailu po rejestracji — nie przekazuj go innym osobom. Jeśli to nie Ty, zignoruj tę wiadomość.</p>
  <p style="font-size: 12px; color: #999; word-break: break-all;">${url}</p>
  <p style="font-size: 12px; color: #999;">${BRAND_NAME}</p>
</div>`;

  return { subject: `Twój link do wydarzenia ${params.eventName}`, html };
}

/** „Wejdź ponownie” — link do panelu uczestnika (stały token osobisty z rejestracji). */
export async function sendAttendeeAccessLinkEmail(params: {
  to: string;
  firstName: string | null;
  eventName: string;
  eventSlug: string;
  qrCodeToken: string;
  origin: string;
}) {
  const { subject, html } = buildAttendeeAccessLinkEmail({
    firstName: params.firstName,
    eventName: params.eventName,
    accessUrl: buildAttendeeAccessUrl(params.eventSlug, params.qrCodeToken, params.origin),
  });
  await sendAppEmail({ to: params.to, subject, html });
}
