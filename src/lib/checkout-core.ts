// Czysta logika kasy biletowej (bez bazy) — współdzielona przez akcje kasy i webhook płatności.

/** Czas, przez który oczekujące zamówienie trzyma miejsce w puli (jak w SQL i cronie). */
export const PENDING_ORDER_TTL_MINUTES = 20;

export type DiscountRule = {
  kind: "percent" | "amount";
  value: number;
};

/** Kwota rabatu w groszach, nie większa niż cena. */
export function computeDiscountAmount(unitPrice: number, rule: DiscountRule): number {
  const raw = rule.kind === "percent" ? Math.floor((unitPrice * rule.value) / 100) : rule.value;
  return Math.max(0, Math.min(raw, unitPrice));
}

/** Kwota do zapłaty po rabacie (nigdy ujemna). 0 = zamówienie bez płatności. */
export function totalAfterDiscount(unitPrice: number, discountAmount: number): number {
  return Math.max(0, unitPrice - discountAmount);
}

/**
 * Czy kod ma jeszcze wolne użycia: potwierdzone użycia + trwające płatności z tym kodem
 * (rezerwacje młodsze niż PENDING_ORDER_TTL_MINUTES) muszą być mniejsze niż limit.
 */
export function hasDiscountUsesLeft(
  code: { max_uses: number | null; uses_count: number },
  activePendingUses: number,
): boolean {
  if (code.max_uses === null) return true;
  return code.uses_count + Math.max(0, activePendingUses) < code.max_uses;
}

/** Status nowego uczestnika z kasy — ten sam co przy zwykłej rejestracji. */
export function initialAttendeeStatus(requiresApproval: boolean): "pending" | "approved" {
  return requiresApproval ? "pending" : "approved";
}

/**
 * Jedno pole „imię i nazwisko” → imię + nazwisko. Pierwszy wyraz to imię, reszta to nazwisko
 * („Anna Maria Kowalska-Nowak” → „Anna” + „Maria Kowalska-Nowak”). Bez nazwiska → „-”.
 */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "-", lastName: "-" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || "-" };
}

/**
 * Imię i nazwisko kupującego z zamówienia: osobne pola z formularza, gdy są zapisane;
 * starsze zamówienia mają tylko buyer_name — wtedy podział przez splitFullName.
 */
export function buyerNameParts(order: {
  buyer_name: string;
  buyer_first_name?: string | null;
  buyer_last_name?: string | null;
}): { firstName: string; lastName: string } {
  const first = order.buyer_first_name?.trim();
  const last = order.buyer_last_name?.trim();
  if (first && last) return { firstName: first, lastName: last };
  return splitFullName(order.buyer_name);
}

/** Czy okno [start, end] obejmuje chwilę `now` (porównanie instantów, nie napisów). */
export function isWithinWindow(
  start: string | null,
  end: string | null,
  now: Date = new Date(),
): "before" | "after" | "open" {
  if (start && Date.parse(start) > now.getTime()) return "before";
  if (end && Date.parse(end) < now.getTime()) return "after";
  return "open";
}

/**
 * Czy zamówienie nadal trzyma swoje miejsca: oczekujące i młodsze niż PENDING_ORDER_TTL_MINUTES
 * (jak v_holds / v_expired w confirm_paid_order). Takie zamówienie zostało już wliczone do limitu
 * przy kasie, więc potwierdzenie płatności nie sprawdza limitu uczestników ponownie.
 */
export function orderReservationHeld(
  order: { status: string; created_at: string | null },
  now: number = Date.now(),
): boolean {
  if (order.status !== "pending" || !order.created_at) return false;
  const created = Date.parse(order.created_at);
  if (Number.isNaN(created)) return false;
  return created >= now - PENDING_ORDER_TTL_MINUTES * 60 * 1000;
}
