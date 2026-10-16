import { BRAND_NAME } from "@/lib/brand";
import { sendAppEmail } from "@/lib/email/send";
import { ITEM_STATUS, OTHER_NEEDS_LABEL, type RequestItem } from "@/lib/booth-requests-core";

// #10 Faza A2 — powiadomienia o zapotrzebowaniu na stoisko. Wysyłka przez sendAppEmail
// (nadawca z RESEND_FROM). Wywołujący łapie błąd — wysyłka nie blokuje zapisu.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const WRAP = `font-family: system-ui, sans-serif; max-width: 560px; line-height: 1.5;`;
const BUTTON = `background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;`;

function itemLine(i: RequestItem, withDecision: boolean): string {
  const name = escapeHtml(i.label);
  const qty = i.label === OTHER_NEEDS_LABEL && !i.catalog_item_id ? "" : ` — ${i.qty} ${escapeHtml(i.unit)}`;
  const note = i.note ? `<br><span style="color:#666;">${escapeHtml(i.note)}</span>` : "";
  if (!withDecision) return `<li>${name}${qty}${note}</li>`;
  const changed = i.status === "changed" ? ` (zatwierdzono: ${i.approved_qty ?? 0} ${escapeHtml(i.unit)})` : "";
  const decision = i.decision_note ? `<br><em>Uwaga organizatora: ${escapeHtml(i.decision_note)}</em>` : "";
  return `<li><strong>${ITEM_STATUS[i.status].label}</strong>: ${name}${qty}${changed}${note}${decision}</li>`;
}

/** Do organizatora: partner wysłał (lub zmienił) wniosek — lista pozycji do akceptacji. */
export async function sendBoothRequestSubmittedEmail(params: {
  to: string;
  partnerName: string;
  eventName: string;
  pendingItems: RequestItem[];
  lateChange: boolean;
  reviewUrl: string;
}) {
  const partner = escapeHtml(params.partnerName);
  const event = escapeHtml(params.eventName);
  const url = escapeHtml(params.reviewUrl);
  const late = params.lateChange ? `<p><strong>Zmiana zgłoszona po terminie składania wniosków.</strong></p>` : "";
  const html = `<div style="${WRAP}">
  <h1 style="font-size: 20px;">Zapotrzebowanie na stoisko — ${partner}</h1>
  <p>Partner <strong>${partner}</strong> wysłał do akceptacji zapotrzebowanie na stoisko (${event}).</p>
  ${late}
  ${
    params.pendingItems.length
      ? `<p>Pozycje do akceptacji:</p><ul>${params.pendingItems.map((i) => itemLine(i, false)).join("")}</ul>`
      : `<p>Zmieniono informacje o stoisku (obsługa, montaż, rozładunek) — bez nowych pozycji do akceptacji.</p>`
  }
  <p style="margin: 24px 0;"><a href="${url}" style="${BUTTON}">Przejdź do wniosku</a></p>
  <p style="font-size: 12px; color: #999;">Wiadomość z ${BRAND_NAME}.</p>
</div>`;
  await sendAppEmail({
    to: params.to,
    subject: `Zapotrzebowanie na stoisko do akceptacji — ${params.partnerName}`,
    html,
  });
}

/** Do partnera: organizator rozpatrzył wszystkie pozycje — decyzje z uwagami. */
export async function sendBoothDecisionEmail(params: {
  to: string;
  partnerName: string;
  eventName: string;
  items: RequestItem[];
  panelUrl: string;
}) {
  const partner = escapeHtml(params.partnerName);
  const event = escapeHtml(params.eventName);
  const url = escapeHtml(params.panelUrl);
  const html = `<div style="${WRAP}">
  <h1 style="font-size: 20px;">Decyzja w sprawie zapotrzebowania na stoisko</h1>
  <p>Organizator wydarzenia <strong>${event}</strong> rozpatrzył zapotrzebowanie firmy <strong>${partner}</strong>:</p>
  <ul>${params.items.map((i) => itemLine(i, true)).join("")}</ul>
  <p style="margin: 24px 0;"><a href="${url}" style="${BUTTON}">Otwórz panel partnera</a></p>
  <p style="font-size: 12px; color: #999;">Wiadomość z ${BRAND_NAME}.</p>
</div>`;
  await sendAppEmail({
    to: params.to,
    subject: `Zapotrzebowanie na stoisko rozpatrzone — ${params.eventName}`,
    html,
  });
}
