// Panel prowadzącego — odczyty (service_role). Tabele moderator_links / event_alerts /
// moderator_notes mają RLS deny-all: organizator czyta je po getOwnEvent(), prowadzący
// po resolveModeratorLink(token). Same funkcje (poza resolveModeratorLink) nie autoryzują.
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import { getEventSessionsForParticipant, type Session } from "@/lib/sessions";
import { alertInLinkScope, sessionInLinkScope } from "@/lib/moderator-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ModeratorLink = {
  id: string;
  event_id: string;
  room: string | null;
  label: string;
  token: string;
  revoked_at: string | null;
  created_at: string;
};

export type EventAlert = {
  id: string;
  event_id: string;
  room: string | null;
  content: string;
  is_important: boolean;
  announced_at: string | null;
  announced_via: string | null;
  created_at: string;
};

export type ModeratorEvent = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string | null;
  primary_color: string | null;
  room_names: string[] | null;
};

export type ModeratorContext = { link: ModeratorLink; event: ModeratorEvent };

/**
 * Walidacja linku prowadzącego. null (→ 404 / błąd akcji), gdy: zły format, link
 * unieważniony, event usunięty lub zarchiwizowany, event/organizacja zawieszone,
 * plan bez funkcji live_qa.
 */
export async function resolveModeratorLink(token: string): Promise<ModeratorContext | null> {
  if (typeof token !== "string" || !UUID.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("moderator_links")
    .select(
      "id, event_id, room, label, token, revoked_at, created_at, " +
        "events!inner(id, organization_id, name, slug, status, timezone, primary_color, room_names, deleted_at)",
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;

  const { events, ...link } = data as unknown as ModeratorLink & {
    events: ModeratorEvent & { deleted_at: string | null };
  };
  if (link.revoked_at) return null;
  if (events.deleted_at || events.status === "archived") return null;

  const [eventSus, orgSus, enabled] = await Promise.all([
    admin.from("event_suspensions").select("event_id").eq("event_id", events.id).maybeSingle(),
    admin
      .from("organization_suspensions")
      .select("organization_id")
      .eq("organization_id", events.organization_id)
      .maybeSingle(),
    hasFeature(events.organization_id, "live_qa"),
  ]);
  if (eventSus.data || orgSus.data || !enabled) return null;

  const event: ModeratorEvent = {
    id: events.id,
    organization_id: events.organization_id,
    name: events.name,
    slug: events.slug,
    status: events.status,
    timezone: events.timezone,
    primary_color: events.primary_color,
    room_names: events.room_names,
  };
  return { link, event };
}

/** Sesja eventu w zakresie sali linku (albo null). */
export async function getSessionInScope(ctx: ModeratorContext, sessionId: string) {
  if (!UUID.test(sessionId)) return null;
  const { data } = await createAdminClient()
    .from("sessions")
    .select("id, room")
    .eq("id", sessionId)
    .eq("event_id", ctx.event.id)
    .maybeSingle();
  if (!data || !sessionInLinkScope(ctx.link.room, data.room)) return null;
  return data;
}

// ── Organizator ────────────────────────────────────────────────────────────

export async function getModeratorLinks(eventId: string): Promise<ModeratorLink[]> {
  const { data, error } = await createAdminClient()
    .from("moderator_links")
    .select("id, event_id, room, label, token, revoked_at, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) console.error("[moderator] links read failed", JSON.stringify({ code: error.code, message: error.message }));
  return (data ?? []) as ModeratorLink[];
}

export async function getEventAlerts(eventId: string): Promise<EventAlert[]> {
  const { data, error } = await createAdminClient()
    .from("event_alerts")
    .select("id, event_id, room, content, is_important, announced_at, announced_via, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) console.error("[moderator] alerts read failed", JSON.stringify({ code: error.code, message: error.message }));
  return (data ?? []) as EventAlert[];
}

export type ModeratorNotes = { script: string; bySession: Record<string, string> };

export async function getModeratorNotes(eventId: string): Promise<ModeratorNotes> {
  const { data, error } = await createAdminClient()
    .from("moderator_notes")
    .select("session_id, content")
    .eq("event_id", eventId)
    .limit(1000);
  if (error) console.error("[moderator] notes read failed", JSON.stringify({ code: error.code, message: error.message }));
  const notes: ModeratorNotes = { script: "", bySession: {} };
  for (const n of (data ?? []) as { session_id: string | null; content: string }[]) {
    if (n.session_id) notes.bySession[n.session_id] = n.content;
    else notes.script = n.content;
  }
  return notes;
}

// ── Prowadzący ─────────────────────────────────────────────────────────────

export type ModeratorPartner = {
  id: string;
  name: string;
  logo_url: string | null;
  tier: string | null;
  booth_location: string | null;
  description: string | null;
};

export type ModeratorPanelData = {
  sessions: Session[];
  alerts: EventAlert[];
  notes: ModeratorNotes;
  partners: ModeratorPartner[];
};

/** Dane panelu zawężone do sali linku (sesje, komunikaty, notatki sesji). */
export async function getModeratorPanelData(ctx: ModeratorContext): Promise<ModeratorPanelData> {
  const admin = createAdminClient();
  const [allSessions, alerts, notes, partnersRes] = await Promise.all([
    getEventSessionsForParticipant(ctx.event.id),
    getEventAlerts(ctx.event.id),
    getModeratorNotes(ctx.event.id),
    admin
      .from("partners")
      .select("id, name, logo_url, tier, booth_location, description")
      .eq("event_id", ctx.event.id)
      .order("name", { ascending: true }),
  ]);

  const sessions = allSessions.filter((s) => sessionInLinkScope(ctx.link.room, s.room));
  const inScope = new Set(sessions.map((s) => s.id));
  const bySession = Object.fromEntries(Object.entries(notes.bySession).filter(([id]) => inScope.has(id)));

  return {
    sessions,
    alerts: alerts.filter((a) => alertInLinkScope(ctx.link.room, a.room)),
    notes: { script: notes.script, bySession },
    partners: (partnersRes.data ?? []) as ModeratorPartner[],
  };
}
