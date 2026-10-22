import QRCode from "qrcode";
import type { Event } from "@/lib/events";
import { getTemplate, applyVariables } from "@/lib/message-templates";
import { sendAppEmail } from "@/lib/email/send";
import { buildEventApexUrl } from "@/lib/event-url";
import { QR_CONTENT_ID } from "@/lib/email/attendee-layout";

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
  // Jeden kod QR: wejście na wydarzenie (check_in_token — ten sam, co skanuje recepcja i co
  // uczestnik widzi w panelu). Panel otwiera przycisk/link w treści. Obraz osadzony inline
  // przez Content-ID (cid:qr-code w szablonie) — wyświetla się bez wczytywania obrazów
  // z zewnątrz; ten sam plik jest jedynym załącznikiem.
  const qrPngBuffer = await QRCode.toBuffer(checkInToken ?? accessUrl, {
    type: "png",
    width: 400,
    margin: 2,
  });

  const template = await getTemplate(event.id, templateType);
  const vars = { imię: firstName, nazwa_eventu: event.name, "link_dostępu": accessUrl };
  const subject = applyVariables(template.subject ?? "", vars);
  const html = applyVariables(template.body, vars);

  await sendAppEmail({
    to,
    subject,
    html,
    attachments: [{ filename: "kod-qr-wejscie.png", content: qrPngBuffer, contentId: QR_CONTENT_ID }],
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
