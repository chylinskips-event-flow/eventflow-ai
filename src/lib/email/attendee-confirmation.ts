import QRCode from "qrcode";
import { Resend } from "resend";
import type { Event } from "@/lib/events";
import { getTemplate, applyVariables } from "@/lib/message-templates";
import { getFromAddress } from "@/lib/email/config";
import { buildEventApexUrl } from "@/lib/event-url";

const REPLY_TO = "kontakt@eventro.pl";

export async function sendAttendeeConfirmationEmail(params: {
  to: string;
  firstName: string;
  event: Event;
  qrCodeToken: string;
  checkInToken?: string;
  origin: string;
  templateType?: "registration_confirmed" | "registration_approved";
}) {
  const {
    to,
    firstName,
    event,
    qrCodeToken,
    checkInToken,
    origin,
    templateType = "registration_confirmed",
  } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const accessUrl = `${buildEventApexUrl(event.slug, origin)}/a/${qrCodeToken}`;
  const [qrPngBuffer, checkInQrPngBuffer] = await Promise.all([
    QRCode.toBuffer(accessUrl, { type: "png", width: 400 }),
    checkInToken
      ? QRCode.toBuffer(checkInToken, { type: "png", width: 400 })
      : null,
  ]);

  const template = await getTemplate(event.id, templateType);
  const vars = { imię: firstName, nazwa_eventu: event.name, "link_dostępu": accessUrl };
  const subject = applyVariables(template.subject ?? "", vars);
  const html = applyVariables(template.body, vars);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    replyTo: REPLY_TO,
    to,
    subject,
    html,
    attachments: [
      { filename: "qr-dostep.png", content: qrPngBuffer, contentId: "qr-dostep" },
      ...(checkInQrPngBuffer
        ? [{ filename: "qr-wejscie.png", content: checkInQrPngBuffer, contentId: "qr-wejscie" }]
        : []),
    ],
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendAttendeePendingApprovalEmail(params: {
  to: string;
  firstName: string;
  event: Event;
}) {
  const { to, firstName, event } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const template = await getTemplate(event.id, "registration_pending");
  const vars = { imię: firstName, nazwa_eventu: event.name, "link_dostępu": "" };
  const subject = applyVariables(template.subject ?? "", vars);
  const html = applyVariables(template.body, vars);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    replyTo: REPLY_TO,
    to,
    subject,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendAttendeeRejectedEmail(params: {
  to: string;
  firstName: string;
  event: Event;
}) {
  const { to, firstName, event } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const template = await getTemplate(event.id, "registration_rejected");
  const vars = { imię: firstName, nazwa_eventu: event.name, "link_dostępu": "" };
  const subject = applyVariables(template.subject ?? "", vars);
  const html = applyVariables(template.body, vars);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    replyTo: REPLY_TO,
    to,
    subject,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
