import { Resend } from "resend";
import { EMAIL_REPLY_TO, applyEmailRedirect, getFromAddress, getResendApiKey } from "@/lib/email/config";

type Attachment = { filename: string; content: Buffer; contentId?: string };

/**
 * Wspólna wysyłka wszystkich maili aplikacyjnych: nadawca z RESEND_FROM, replyTo, klient Resend.
 * Rzuca wyjątek przy braku konfiguracji lub błędzie Resend — wywołujący decyduje, co dalej.
 */
export async function sendAppEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}) {
  const from = getFromAddress();
  const { to, subject } = applyEmailRedirect(params.to, params.subject);
  const { error } = await new Resend(getResendApiKey()).emails.send({
    from,
    replyTo: EMAIL_REPLY_TO,
    to,
    subject,
    html: params.html,
    ...(params.attachments?.length ? { attachments: params.attachments } : {}),
  });
  if (error) throw new Error(`Resend error (from ${from}): ${error.message}`);
}
