import QRCode from "qrcode";
import { Resend } from "resend";
import type { Event } from "@/lib/events";

const FROM_ADDRESS = "EventFlow <onboarding@resend.dev>";

const dateRangeFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(params: {
  firstName: string;
  event: Event;
  accessUrl: string;
}) {
  const { firstName, event, accessUrl } = params;

  const dateLine = event.starts_at
    ? `${dateRangeFormatter.format(new Date(event.starts_at))}${
        event.ends_at
          ? ` – ${dateRangeFormatter.format(new Date(event.ends_at))}`
          : ""
      }`
    : null;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
      <h1 style="font-size: 20px;">Witaj, ${escapeHtml(firstName)}!</h1>
      <p>Twoja rejestracja na <strong>${escapeHtml(event.name)}</strong> została potwierdzona.</p>
      ${dateLine ? `<p>${escapeHtml(dateLine)}</p>` : ""}
      ${event.location ? `<p>${escapeHtml(event.location)}</p>` : ""}
      <p style="margin-top: 24px;">
        <img src="cid:qr-code" alt="Twój kod QR" width="200" height="200" />
      </p>
      <p>Pokaż ten kod przy wejściu na wydarzenie.</p>
      <p style="font-size: 13px; color: #666;">
        Jeśli kod się nie wyświetla, użyj tego linku:<br />
        <a href="${accessUrl}">${accessUrl}</a>
      </p>
    </div>
  `;
}

export async function sendAttendeeConfirmationEmail(params: {
  to: string;
  firstName: string;
  event: Event;
  qrCodeToken: string;
  origin: string;
}) {
  const { to, firstName, event, qrCodeToken, origin } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const accessUrl = `${origin}/e/${event.slug}/a/${qrCodeToken}`;
  const qrPngBuffer = await QRCode.toBuffer(accessUrl, { type: "png", width: 400 });

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Potwierdzenie rejestracji — ${event.name}`,
    html: buildEmailHtml({ firstName, event, accessUrl }),
    attachments: [
      {
        filename: "qr-code.png",
        content: qrPngBuffer,
        contentId: "qr-code",
      },
    ],
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
