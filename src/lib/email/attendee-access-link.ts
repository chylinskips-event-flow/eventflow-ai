import { sendAppEmail } from "@/lib/email/send";
import { buildEventApexUrl } from "@/lib/event-url";
import { formatDate } from "@/lib/format";
import {
  emailButton,
  emailFallbackLink,
  escapeHtml,
  renderAttendeeEmail,
} from "@/lib/email/attendee-layout";

export function buildAttendeeAccessUrl(slug: string, qrCodeToken: string, origin: string): string {
  return `${buildEventApexUrl(slug, origin)}/a/${qrCodeToken}`;
}

export type AccessLinkEntry = {
  firstName: string | null;
  lastName: string | null;
  /** Data rejestracji, już sformatowana (strefa wydarzenia). */
  registeredAt: string | null;
  accessUrl: string;
};

const FONT = "font-family: Arial, Helvetica, sans-serif;";

function fullName(entry: AccessLinkEntry): string {
  return [entry.firstName, entry.lastName].map((v) => v?.trim()).filter(Boolean).join(" ");
}

export function buildAttendeeAccessLinkEmail(params: {
  eventName: string;
  entries: AccessLinkEntry[];
}): { subject: string; html: string } {
  const event = escapeHtml(params.eventName);
  const [first] = params.entries;
  const multiple = params.entries.length > 1;
  const name = !multiple ? first.firstName?.trim() : null;
  const heading = name ? `Witaj, ${escapeHtml(name)}!` : "Witaj!";

  // Jeden rekord: przycisk + link awaryjny. Kilka rekordów na ten sam adres: lista — każdy
  // z imieniem, nazwiskiem, datą rejestracji, własnym przyciskiem i linkiem awaryjnym.
  const content = multiple
    ? [
        `<p style="${FONT} margin: 0 0 12px; font-size: 15px; line-height: 22px; color: #374151;">Ktoś (prawdopodobnie Ty) poprosił o link do panelu uczestnika wydarzenia <strong>${event}</strong>. Na ten adres e-mail jest zarejestrowanych kilka osób — każda ma własny panel:</p>`,
        ...params.entries.map((entry) => {
          const url = escapeHtml(entry.accessUrl);
          const date = entry.registeredAt
            ? `<br><span style="font-size: 13px; color: #6b7280;">Rejestracja: ${escapeHtml(entry.registeredAt)}</span>`
            : "";
          return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 8px;">
        <tr>
          <td style="padding: 16px; ${FONT} font-size: 15px; line-height: 22px; color: #111827;">
            <strong>${escapeHtml(fullName(entry) || "Uczestnik")}</strong>${date}
            ${emailButton("Otwórz panel", url)}
            ${emailFallbackLink(url)}
          </td>
        </tr>
      </table>`;
        }),
      ]
    : [
        `<p style="${FONT} margin: 0 0 12px; font-size: 15px; line-height: 22px; color: #374151;">Ktoś (prawdopodobnie Ty) poprosił o link do Twojego panelu uczestnika wydarzenia <strong>${event}</strong>. Otwórz go na urządzeniu, którego chcesz używać na wydarzeniu.</p>`,
        emailButton("Otwórz mój panel", escapeHtml(first.accessUrl)),
        emailFallbackLink(escapeHtml(first.accessUrl)),
      ];

  const note = multiple
    ? "To te same osobiste linki, które przyszły w mailach po rejestracji — nie przekazuj ich innym osobom. Jeśli to nie Ty, zignoruj tę wiadomość."
    : "To ten sam osobisty link, który przyszedł w mailu po rejestracji — nie przekazuj go innym osobom. Jeśli to nie Ty, zignoruj tę wiadomość.";

  const html = renderAttendeeEmail({
    eventName: event,
    heading,
    contentHtml: [
      ...content,
      `<p style="${FONT} margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 13px; line-height: 20px; color: #6b7280;">${note}</p>`,
    ].join("\n      "),
  });

  return { subject: `Twój link do wydarzenia ${params.eventName}`, html };
}

/** „Wejdź ponownie” — jeden mail z linkiem (lub listą linków) do panelu uczestnika (stały token z rejestracji). */
export async function sendAttendeeAccessLinkEmail(params: {
  to: string;
  eventName: string;
  eventSlug: string;
  eventTimezone?: string | null;
  attendees: {
    first_name: string | null;
    last_name: string | null;
    qr_code_token: string;
    created_at: string;
  }[];
  origin: string;
}) {
  const { subject, html } = buildAttendeeAccessLinkEmail({
    eventName: params.eventName,
    entries: params.attendees.map((a) => ({
      firstName: a.first_name,
      lastName: a.last_name,
      registeredAt: formatDate(a.created_at, params.eventTimezone),
      accessUrl: buildAttendeeAccessUrl(params.eventSlug, a.qr_code_token, params.origin),
    })),
  });
  await sendAppEmail({ to: params.to, subject, html });
}
