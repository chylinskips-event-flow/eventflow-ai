import { BRAND_NAME } from "@/lib/brand";

// Wspólny układ maili uczestnika (potwierdzenie, zatwierdzenie, oczekiwanie, odrzucenie,
// „Wejdź ponownie”): szare tło, biała karta, akcent indigo #4f46e5. Wyłącznie tabele i style
// inline — bez flexboxa i zewnętrznych arkuszy (Gmail, Outlook, aplikacje mobilne).

export const QR_CONTENT_ID = "qr-code";
export const EMAIL_INDIGO = "#4f46e5";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT = "font-family: Arial, Helvetica, sans-serif;";

/** Przycisk „pigułka” w tabeli (działa też w Outlooku). `url` musi być już bezpieczny dla HTML. */
export function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px auto;">
        <tr>
          <td align="center" bgcolor="${EMAIL_INDIGO}" style="border-radius: 8px;">
            <a href="${url}" style="${FONT} display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 8px;">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>`;
}

/** Link awaryjny pod przyciskiem. `url` musi być już bezpieczny dla HTML. */
export function emailFallbackLink(url: string): string {
  return `<p style="${FONT} margin: 0 0 8px; font-size: 12px; line-height: 18px; color: #6b7280; text-align: center;">Jeśli przycisk nie działa, skopiuj ten link do przeglądarki:</p>
      <p style="${FONT} margin: 0; font-size: 12px; line-height: 18px; color: ${EMAIL_INDIGO}; text-align: center; word-break: break-all;"><a href="${url}" style="color: ${EMAIL_INDIGO};">${url}</a></p>`;
}

/** Kod QR osadzony jako obraz inline (Content-ID = załącznik maila), w ramce. */
export function emailQrBlock(instruction: string | null): string {
  const caption = instruction
    ? `\n      <p style="${FONT} margin: 12px 0 0; font-size: 14px; line-height: 20px; color: #374151; text-align: center;">${instruction}</p>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px auto 0;">
        <tr>
          <td align="center" style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
            <img src="cid:${QR_CONTENT_ID}" alt="Kod QR do wejścia" width="200" height="200" style="display: block; width: 200px; height: 200px; border: 0;" />
          </td>
        </tr>
      </table>${caption}`;
}

/**
 * Szkielet maila. `eventName`, `heading` i `contentHtml` muszą być już bezpieczne dla HTML
 * (escapowane albo zmienne szablonu typu {nazwa_eventu}, podstawiane później z escapowaniem).
 */
export function renderAttendeeEmail(params: {
  eventName: string;
  heading: string | null;
  contentHtml: string;
}): string {
  const heading = params.heading
    ? `<h1 style="${FONT} margin: 0 0 16px; font-size: 22px; line-height: 28px; color: #111827;">${params.heading}</h1>\n      `
    : "";
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${params.eventName}</title>
</head>
<body style="margin: 0; padding: 0; background: #f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background: #f3f4f6;">
  <tr>
    <td align="center" style="padding: 24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; background: #ffffff; border-radius: 12px; overflow: hidden;">
        <tr>
          <td bgcolor="${EMAIL_INDIGO}" style="background: ${EMAIL_INDIGO}; padding: 20px 28px;">
            <p style="${FONT} margin: 0; font-size: 18px; line-height: 24px; font-weight: bold; color: #ffffff;">${params.eventName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px; ${FONT} font-size: 15px; line-height: 22px; color: #374151;">
      ${heading}${params.contentHtml}
          </td>
        </tr>
      </table>
      <p style="${FONT} margin: 16px 0 0; font-size: 12px; line-height: 18px; color: #9ca3af; text-align: center;">${BRAND_NAME} · eventro.pl</p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Akapity z tekstu (podwójny enter = nowy akapit). Tekst jest escapowany. */
export function emailParagraphs(text: string | null): string {
  return (text ?? "")
    .split("\n\n")
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="${FONT} margin: 0 0 12px; font-size: 15px; line-height: 22px; color: #374151;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n      ");
}
