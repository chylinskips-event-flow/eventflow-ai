import { Resend } from "resend";
import { BRAND_NAME } from "@/lib/brand";
import { getFromAddress } from "@/lib/email/config";

const REPLY_TO = "kontakt@eventro.pl";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Zaproszenie do panelu partnera — link prowadzi na stronę zaproszenia (logowanie magic link). */
export async function sendPartnerInviteEmail(params: {
  to: string;
  partnerName: string;
  eventName: string;
  inviteUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const partner = escapeHtml(params.partnerName);
  const event = escapeHtml(params.eventName);
  const url = escapeHtml(params.inviteUrl);
  const html = `<div style="font-family: system-ui, sans-serif; max-width: 560px; line-height: 1.5;">
  <h1 style="font-size: 20px;">Panel partnera — ${event}</h1>
  <p>Organizator wydarzenia <strong>${event}</strong> zaprasza firmę <strong>${partner}</strong> do panelu partnera w ${BRAND_NAME}.</p>
  <p>W panelu uzupełnisz wizytówkę firmy, ofertę dla uczestników i materiały do pobrania. Zmiany pojawią się na stronie wydarzenia po akceptacji organizatora.</p>
  <p style="margin: 24px 0;"><a href="${url}" style="background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">Przyjmij zaproszenie</a></p>
  <p style="font-size: 13px; color: #666;">Logowanie bez hasła — wyślemy jednorazowy link na ten adres e-mail. Zaproszenie jest ważne 14 dni. Jeśli nie spodziewasz się tej wiadomości, zignoruj ją.</p>
  <p style="font-size: 12px; color: #999; word-break: break-all;">${url}</p>
</div>`;

  const { error } = await new Resend(apiKey).emails.send({
    from: getFromAddress(),
    replyTo: REPLY_TO,
    to: params.to,
    subject: `Zaproszenie do panelu partnera — ${params.eventName}`,
    html,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
