import { BRAND_NAME } from "@/lib/brand";
import { sendAppEmail } from "@/lib/email/send";
import { buildEventApexUrl } from "@/lib/event-url";
import { formatDate } from "@/lib/format";

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

export type AccessLinkEntry = {
  firstName: string | null;
  lastName: string | null;
  /** Data rejestracji, już sformatowana (strefa wydarzenia). */
  registeredAt: string | null;
  accessUrl: string;
};

const BUTTON_STYLE =
  "background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;";

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
  const greeting =
    !multiple && first.firstName?.trim() ? `Cześć ${escapeHtml(first.firstName.trim())},` : "Cześć,";

  // Jeden rekord: przycisk + link awaryjny. Kilka rekordów na ten sam adres: lista — każdy
  // z imieniem, nazwiskiem, datą rejestracji, własnym przyciskiem i linkiem awaryjnym.
  const body = multiple
    ? `<p>ktoś (prawdopodobnie Ty) poprosił o link do panelu uczestnika wydarzenia <strong>${event}</strong>. Na ten adres e-mail jest zarejestrowanych kilka osób — każda ma własny panel:</p>
  ${params.entries
    .map((entry) => {
      const url = escapeHtml(entry.accessUrl);
      const name = escapeHtml(fullName(entry) || "Uczestnik");
      const date = entry.registeredAt ? `<br><span style="font-size: 13px; color: #666;">Rejestracja: ${escapeHtml(entry.registeredAt)}</span>` : "";
      return `<div style="margin: 16px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
    <p style="margin: 0 0 12px;"><strong>${name}</strong>${date}</p>
    <a href="${url}" style="${BUTTON_STYLE}">Otwórz panel</a>
    <p style="margin: 12px 0 0; font-size: 12px; color: #999; word-break: break-all;">${url}</p>
  </div>`;
    })
    .join("\n  ")}`
    : `<p>ktoś (prawdopodobnie Ty) poprosił o link do Twojego panelu uczestnika wydarzenia <strong>${event}</strong>. Otwórz go na urządzeniu, którego chcesz używać na wydarzeniu.</p>
  <p style="margin: 24px 0;"><a href="${escapeHtml(first.accessUrl)}" style="${BUTTON_STYLE}">Otwórz panel uczestnika</a></p>`;

  const fallback = multiple
    ? ""
    : `\n  <p style="font-size: 12px; color: #999; word-break: break-all;">${escapeHtml(first.accessUrl)}</p>`;
  const linkWord = multiple ? "Te same osobiste linki, które przyszły" : "To ten sam osobisty link, który przyszedł";
  const html = `<div style="font-family: system-ui, sans-serif; max-width: 560px; line-height: 1.5;">
  <h1 style="font-size: 20px;">${event}</h1>
  <p>${greeting}</p>
  ${body}
  <p style="font-size: 13px; color: #666;">${linkWord} w mailu po rejestracji — nie przekazuj ich innym osobom. Jeśli to nie Ty, zignoruj tę wiadomość.</p>${fallback}
  <p style="font-size: 12px; color: #999;">${BRAND_NAME}</p>
</div>`;

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
