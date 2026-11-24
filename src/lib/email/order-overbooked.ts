import { BRAND_NAME } from "@/lib/brand";
import { sendAppEmail } from "@/lib/email/send";
import { escapeHtml } from "@/lib/email/attendee-layout";
import { formatPrice } from "@/lib/tickets";

// Do organizatora: płatność potwierdzona po wygaśnięciu rezerwacji, a pula była już wyczerpana,
// albo przy osiągniętym limicie uczestników z planu.
// Bilet nie został wystawiony — organizator decyduje o zwrocie (brak automatycznego zwrotu).

export type OverbookedOrderInfo = {
  eventName: string;
  buyerName: string;
  buyerEmail: string;
  amount: number; // grosze
  currency: string;
  sessionId: string;
  p24OrderId: string;
  /** Przyczyna: wyczerpana pula biletów (domyślnie) albo limit uczestników z planu. */
  reason?: "pool" | "attendee_limit";
};

export function buildOrderOverbookedEmail(info: OverbookedOrderInfo): { subject: string; html: string } {
  const e = (v: string) => escapeHtml(v);
  const cause =
    info.reason === "attendee_limit"
      ? "wydarzenie osiągnęło limit uczestników dostępny w Twoim planie"
      : "rezerwacja kupującego wygasła, a pula biletów została w tym czasie wyczerpana";
  const action =
    info.reason === "attendee_limit"
      ? "zmień plan na wyższy i dodaj uczestnika ręcznie albo zwróć płatność w panelu Przelewy24"
      : "zwiększ pulę i wystaw bilet ręcznie albo zwróć płatność w panelu Przelewy24";
  const html = `<div style="font-family: system-ui, sans-serif; max-width: 560px; line-height: 1.5;">
  <h1 style="font-size: 20px;">Płatność bez wolnego miejsca — ${e(info.eventName)}</h1>
  <p>Przelewy24 potwierdziły płatność za bilet, ale ${cause}. <strong>Bilet nie został wystawiony.</strong></p>
  <ul>
    <li>Kupujący: ${e(info.buyerName)} (${e(info.buyerEmail)})</li>
    <li>Kwota: ${e(formatPrice(info.amount, info.currency))}</li>
    <li>Numer transakcji Przelewy24: ${e(info.p24OrderId)}</li>
    <li>Identyfikator sesji: ${e(info.sessionId)}</li>
  </ul>
  <p>Co zrobić: ${action} i poinformuj kupującego.</p>
  <p style="font-size: 12px; color: #999;">Wiadomość z ${BRAND_NAME}.</p>
</div>`;
  return { subject: `Płatność bez wolnego miejsca — ${info.eventName}`, html };
}

export async function sendOrderOverbookedEmail(to: string, info: OverbookedOrderInfo) {
  const { subject, html } = buildOrderOverbookedEmail(info);
  await sendAppEmail({ to, subject, html });
}
