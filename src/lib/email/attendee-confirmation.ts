import QRCode from "qrcode";
import { Resend } from "resend";
import type { Event } from "@/lib/events";
import { getTemplate, applyVariables } from "@/lib/message-templates";
import { BRAND_NAME_SHORT } from "@/lib/brand";

const FROM_ADDRESS = `${BRAND_NAME_SHORT} <onboarding@resend.dev>`;

export async function sendAttendeeConfirmationEmail(params: {
  to: string;
  firstName: string;
  event: Event;
  qrCodeToken: string;
  origin: string;
  templateType?: "registration_confirmed" | "registration_approved";
}) {
  const {
    to,
    firstName,
    event,
    qrCodeToken,
    origin,
    templateType = "registration_confirmed",
  } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const accessUrl = `${origin}/e/${event.slug}/a/${qrCodeToken}`;
  const qrPngBuffer = await QRCode.toBuffer(accessUrl, { type: "png", width: 400 });

  const template = await getTemplate(event.id, templateType);
  const vars = { imię: firstName, nazwa_eventu: event.name, "link_dostępu": accessUrl };
  const subject = applyVariables(template.subject ?? "", vars);
  const html = applyVariables(template.body, vars);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    attachments: [
      {
        filename: "qr-code.png",
        content: qrPngBuffer,
        contentId: "qr-code",
      },
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
    from: FROM_ADDRESS,
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
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
