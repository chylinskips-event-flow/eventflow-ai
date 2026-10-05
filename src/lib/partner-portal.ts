// Panel partnera — odczyty i autoryzacja (service_role po weryfikacji tożsamości).
// Tożsamość partnera = zalogowany użytkownik Supabase Auth (magic link) + aktywny wiersz
// partner_access (user_id = ja, revoked_at IS NULL). Sprawdzane przy KAŻDEJ stronie i akcji.
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import type { Partner } from "@/lib/partners";
import { parseSocialLinks, type ProfileFields, type SocialLinks } from "@/lib/partner-portal-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PartnerPortalEvent = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string | null;
  starts_at: string | null;
};

export type PartnerAccessRow = {
  id: string;
  partner_id: string;
  event_id: string;
  email: string;
  invite_token: string;
  invite_expires_at: string;
  invited_at: string;
  user_id: string | null;
  accepted_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
};

const ACCESS_COLUMNS =
  "id, partner_id, event_id, email, invite_token, invite_expires_at, invited_at, user_id, accepted_at, last_seen_at, revoked_at";
// Jawne FK — partner_access ma relacje i do partners, i do events (bez hintów ryzyko PGRST201).
const EVENT_EMBED =
  "events!partner_access_event_id_fkey(id, organization_id, name, slug, status, timezone, starts_at, deleted_at)";
const PARTNER_EMBED = "partners!partner_access_partner_id_fkey(id, name, logo_url, tier)";

/** Zalogowany użytkownik (Supabase Auth) albo null. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: (user.email ?? "").toLowerCase() } : null;
});

/** Event dostępny dla panelu partnera: nieusunięty, bez zawieszenia, plan z partner_portal. */
async function isEventAvailable(event: PartnerPortalEvent & { deleted_at: string | null }): Promise<boolean> {
  if (event.deleted_at) return false;
  const admin = createAdminClient();
  const [eventSus, orgSus, enabled] = await Promise.all([
    admin.from("event_suspensions").select("event_id").eq("event_id", event.id).maybeSingle(),
    admin
      .from("organization_suspensions")
      .select("organization_id")
      .eq("organization_id", event.organization_id)
      .maybeSingle(),
    hasFeature(event.organization_id, "partner_portal"),
  ]);
  return !eventSus.data && !orgSus.data && enabled;
}

function stripDeleted(e: PartnerPortalEvent & { deleted_at: string | null }): PartnerPortalEvent {
  return {
    id: e.id,
    organization_id: e.organization_id,
    name: e.name,
    slug: e.slug,
    status: e.status,
    timezone: e.timezone,
    starts_at: e.starts_at,
  };
}

export type PartnerMembership = {
  accessId: string;
  partner: { id: string; name: string; logo_url: string | null; tier: string | null };
  event: PartnerPortalEvent;
};

/** Wszyscy partnerzy (eventy), do których zalogowany użytkownik ma aktywny dostęp. */
export async function getMyPartnerMemberships(userId: string): Promise<PartnerMembership[]> {
  const { data, error } = await createAdminClient()
    .from("partner_access")
    .select(`id, ${PARTNER_EMBED}, ${EVENT_EMBED}`)
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) {
    console.error("[partner-portal] memberships read failed", JSON.stringify({ code: error.code, message: error.message }));
    return [];
  }
  type Row = {
    id: string;
    partners: PartnerMembership["partner"] | null;
    events: (PartnerPortalEvent & { deleted_at: string | null }) | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const out: PartnerMembership[] = [];
  for (const r of rows) {
    if (!r.partners || !r.events) continue;
    if (!(await isEventAvailable(r.events))) continue;
    out.push({ accessId: r.id, partner: r.partners, event: stripDeleted(r.events) });
  }
  return out;
}

export type PartnerContext = {
  user: { id: string; email: string };
  accessId: string;
  partner: Partner;
  event: PartnerPortalEvent;
};

/**
 * Autoryzacja panelu partnera: zalogowany + aktywny dostęp do TEGO partnera + event
 * dostępny. null → brak dostępu (strona: 404/login, akcja: błąd).
 */
export async function getPartnerContext(partnerId: string): Promise<PartnerContext | null> {
  if (!UUID.test(partnerId)) return null;
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("partner_access")
    .select(`id, ${EVENT_EMBED}`)
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const event = (data as unknown as { events: (PartnerPortalEvent & { deleted_at: string | null }) | null }).events;
  if (!event || !(await isEventAvailable(event))) return null;

  const { data: partner } = await admin
    .from("partners")
    .select("*")
    .eq("id", partnerId)
    .eq("event_id", event.id)
    .maybeSingle();
  if (!partner) return null;

  return { user, accessId: data.id as string, partner: partner as Partner, event: stripDeleted(event) };
}

export async function touchPartnerAccess(accessId: string) {
  await createAdminClient()
    .from("partner_access")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", accessId);
}

// ── Zaproszenie ────────────────────────────────────────────────────────────

export type InviteView = {
  access: PartnerAccessRow;
  partnerName: string;
  event: PartnerPortalEvent;
};

/** Zaproszenie po tokenie — null, gdy nie istnieje, unieważnione lub event niedostępny. */
export async function getInviteByToken(token: string): Promise<InviteView | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("partner_access")
    .select(`${ACCESS_COLUMNS}, ${PARTNER_EMBED}, ${EVENT_EMBED}`)
    .eq("invite_token", token)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as PartnerAccessRow & {
    partners: { name: string } | null;
    events: (PartnerPortalEvent & { deleted_at: string | null }) | null;
  };
  if (row.revoked_at || !row.partners || !row.events) return null;
  if (!(await isEventAvailable(row.events))) return null;
  const { partners, events, ...access } = row;
  return { access, partnerName: partners.name, event: stripDeleted(events) };
}

// ── Treść partnera ─────────────────────────────────────────────────────────

export type ProfileDraft = ProfileFields & {
  status: "pending" | "rejected";
  review_note: string | null;
  submitted_at: string;
};

export function publishedProfile(p: Partner): ProfileFields {
  return {
    name: p.name,
    logo_url: p.logo_url,
    description: p.description,
    website_url: p.website_url ?? null,
    offer: p.offer ?? null,
    social_links: parseSocialLinks(p.social_links),
  };
}

export async function getProfileDraft(partnerId: string): Promise<ProfileDraft | null> {
  const { data } = await createAdminClient()
    .from("partner_profile_drafts")
    .select("name, logo_url, description, website_url, offer, social_links, status, review_note, submitted_at")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!data) return null;
  return { ...(data as ProfileDraft), social_links: parseSocialLinks(data.social_links) as SocialLinks };
}

export type PartnerContact = { contact_name: string | null; contact_email: string | null; contact_phone: string | null };

export async function getPartnerContact(partnerId: string): Promise<PartnerContact | null> {
  const { data } = await createAdminClient()
    .from("partner_contacts")
    .select("contact_name, contact_email, contact_phone")
    .eq("partner_id", partnerId)
    .maybeSingle();
  return (data as PartnerContact | null) ?? null;
}

export type PartnerMaterial = {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
};

const MATERIAL_COLUMNS = "id, title, file_name, mime_type, size_bytes, status, review_note, created_at";

export async function getPartnerMaterials(
  partnerId: string,
  opts: { approvedOnly?: boolean } = {},
): Promise<PartnerMaterial[]> {
  let q = createAdminClient()
    .from("partner_materials")
    .select(MATERIAL_COLUMNS)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true });
  if (opts.approvedOnly) q = q.eq("status", "approved");
  const { data, error } = await q;
  if (error) console.error("[partner-portal] materials read failed", JSON.stringify({ code: error.code, message: error.message }));
  return (data ?? []) as PartnerMaterial[];
}

// ── Organizator ────────────────────────────────────────────────────────────

export async function getPartnerAccessList(partnerId: string): Promise<PartnerAccessRow[]> {
  const { data, error } = await createAdminClient()
    .from("partner_access")
    .select(ACCESS_COLUMNS)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true });
  if (error) console.error("[partner-portal] access read failed", JSON.stringify({ code: error.code, message: error.message }));
  return (data ?? []) as PartnerAccessRow[];
}

/** Liczba rzeczy czekających na organizatora per partner (szkic profilu + materiały). */
export async function getPendingReviewCounts(eventId: string): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const [drafts, materials] = await Promise.all([
    admin
      .from("partner_profile_drafts")
      .select("partner_id, partners!inner(event_id)")
      .eq("status", "pending")
      .eq("partners.event_id" as never, eventId),
    admin.from("partner_materials").select("partner_id").eq("event_id", eventId).eq("status", "pending"),
  ]);
  const counts: Record<string, number> = {};
  for (const r of [...(drafts.data ?? []), ...(materials.data ?? [])] as { partner_id: string }[]) {
    counts[r.partner_id] = (counts[r.partner_id] ?? 0) + 1;
  }
  return counts;
}

/** Podpisany URL do pliku materiału (prywatny bucket) — po autoryzacji w wywołującym. */
export async function signedMaterialUrl(materialId: string, partnerId: string, download = true): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("partner_materials")
    .select("file_path, file_name")
    .eq("id", materialId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!data) return null;
  const { data: signed } = await admin.storage
    .from("partner-materials")
    .createSignedUrl(data.file_path, 60, download ? { download: data.file_name } : undefined);
  return signed?.signedUrl ?? null;
}

// ── Logowanie / przyjęcie zaproszenia ──────────────────────────────────────

/**
 * Przypisuje do zalogowanego użytkownika ważne, nieunieważnione zaproszenia na JEGO
 * adres e-mail. Bezpieczne: e-mail potwierdził Supabase Auth (magic link), a zaproszenie
 * wystawił organizator na ten adres. Idempotentne.
 */
export async function claimPendingInvites(user: { id: string; email: string }): Promise<number> {
  if (!user.email) return 0;
  const { data, error } = await createAdminClient()
    .from("partner_access")
    .update({ user_id: user.id, accepted_at: new Date().toISOString() })
    .eq("email", user.email)
    .is("user_id", null)
    .is("revoked_at", null)
    .gt("invite_expires_at", new Date().toISOString())
    .select("id");
  if (error) {
    console.error("[partner-portal] claim failed", JSON.stringify({ code: error.code, message: error.message }));
    return 0;
  }
  return data?.length ?? 0;
}

/** Czy adres ma dostęp (aktywny albo ważne zaproszenie) — warunek wysłania linku logowania. */
export async function emailHasPartnerAccess(email: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("partner_access")
    .select("id, user_id, invite_expires_at")
    .eq("email", email)
    .is("revoked_at", null)
    .limit(20);
  const now = Date.now();
  return (data ?? []).some(
    (r) => r.user_id !== null || new Date(r.invite_expires_at as string).getTime() > now,
  );
}
