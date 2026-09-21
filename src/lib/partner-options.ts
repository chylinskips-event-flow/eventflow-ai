// Client-safe stałe/utility partnerów (zero importów server-only), żeby mogły
// ich używać komponenty klienckie bez ciągnięcia supabase/server. Wzorzec jak
// event-options.ts. Zapytania DB żyją osobno w lib/partners.ts.

// Poziomy partnerstwa — value zapisywane w DB, label do wyświetlenia.
export const PARTNER_TIERS = [
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "bronze", label: "Bronze" },
  { value: "partner", label: "Partner" },
] as const;

export function partnerTierLabel(tier: string | null): string | null {
  if (!tier) return null;
  return PARTNER_TIERS.find((t) => t.value === tier)?.label ?? tier;
}
