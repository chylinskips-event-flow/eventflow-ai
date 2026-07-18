import { Resend } from "resend";
import type { FollowupContact } from "@/lib/contact-requests";

// Ten sam adres nadawcy co pozostałe maile (sandbox Resend onboarding@resend.dev).
const FROM_ADDRESS = "EventFlow <onboarding@resend.dev>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contactRow(contact: FollowupContact): string {
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    "Uczestnik";
  const role = [contact.job_title, contact.company].filter(Boolean).join(" · ");

  // Każdy fragment w osobnym bloku — bez zależności od flexa, który w wielu
  // klientach pocztowych nie działa.
  const parts: string[] = [
    `<div style="font-size:15px;font-weight:600;color:#111827;">${escapeHtml(name)}</div>`,
  ];
  if (role) {
    parts.push(
      `<div style="color:#6b7280;font-size:13px;">${escapeHtml(role)}</div>`,
    );
  }
  if (contact.email) {
    const safe = escapeHtml(contact.email);
    parts.push(
      `<div><a href="mailto:${safe}" style="color:#2563eb;font-size:13px;text-decoration:none;">${safe}</a></div>`,
    );
  }
  if (contact.note) {
    parts.push(
      `<div style="color:#6b7280;font-size:13px;font-style:italic;">„${escapeHtml(contact.note)}”</div>`,
    );
  }

  return `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
    ${parts.join("")}
  </td></tr>`;
}

function buildHtml(
  firstName: string | null,
  eventName: string,
  contacts: FollowupContact[],
): string {
  const greeting = firstName ? `Cześć ${escapeHtml(firstName)},` : "Cześć,";
  const rows = contacts.map(contactRow).join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <p style="font-size:16px;">${greeting}</p>
    <p style="font-size:14px;line-height:1.6;color:#374151;">
      Dziękujemy za udział w wydarzeniu <strong>${escapeHtml(eventName)}</strong>!
      Oto kontakty, które wymieniłeś podczas eventu — napisz do nich, póki
      rozmowy są świeże.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${rows}
    </table>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;">
      Krótka wiadomość „miło było poznać" potrafi zamienić przypadkowe
      spotkanie w trwałą znajomość. Powodzenia!
    </p>
  </div>`;
}

/**
 * Mail podsumowujący nawiązane kontakty, wysyłany dzień po evencie.
 * Rzuca wyjątek przy błędzie Resend — wywołujący (cron) łapie per-adresat,
 * żeby jeden błąd (np. sandbox blokujący obcy adres) nie przerwał reszty.
 */
export async function sendPostEventFollowupEmail(params: {
  to: string;
  firstName: string | null;
  eventName: string;
  contacts: FollowupContact[];
}) {
  const { to, firstName, eventName, contacts } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Twoje kontakty z ${eventName}`,
    html: buildHtml(firstName, eventName, contacts),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
