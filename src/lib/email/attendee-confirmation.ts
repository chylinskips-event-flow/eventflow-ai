import QRCode from "qrcode";
import type { Event } from "@/lib/events";
import { getTemplate, applyVariables } from "@/lib/message-templates";
import { sendAppEmail } from "@/lib/email/send";
import { buildEventApexUrl } from "@/lib/event-url";

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

  await sendAppEmail({
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
}

export async function sendAttendeePendingApprovalEmail(params: {
  to: string;
  firstName: string;
  event: Event;
}) {
  const { to, firstName, event } = params;

  const template = await getTemplate(event.id, "registration_pending");
  const vars = { imię: firstName, nazwa_eventu: event.name, "link_dostępu": "" };
  const subject = applyVariables(template.subject ?? "", vars);
  const html = applyVariables(template.body, vars);

  await sendAppEmail({
    to,
    subject,
    html,
  });
}

export async function sendAttendeeRejectedEmail(params: {
  to: string;
  firstName: string;
  event: Event;
}) {
  const { to, firstName, event } = params;

  const template = await getTemplate(event.id, "registration_rejected");
  const vars = { imię: firstName, nazwa_eventu: event.name, "link_dostępu": "" };
  const subject = applyVariables(template.subject ?? "", vars);
  const html = applyVariables(template.body, vars);

  await sendAppEmail({
    to,
    subject,
    html,
  });
}
