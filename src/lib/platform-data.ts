// Odczyty panelu operatora. KAŻDĄ funkcję wywoływać dopiero po requireSuperAdmin().
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeEntitlements,
  type EntitlementSource,
  type OverrideRow,
  type PlanRow,
} from "@/lib/entitlements-core";

export type PlatformPlan = PlanRow;

export type EffectivePlan = {
  planKey: string | null;
  planName: string | null;
  /** override / subscription (Stripe) / default (Free) */
  source: EntitlementSource;
  overrideExpired: boolean;
};

export type PlatformOverride = {
  plan_key: string | null;
  features: Record<string, boolean> | null;
  limits: Record<string, number | null> | null;
  reason: string | null;
  expires_at: string | null;
  updated_at: string;
};

export type PlatformSubscription = {
  plan_key: string;
  status: string;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  owner_email: string | null;
  billing_email: string | null;
  created_at: string;
  event_count: number;
  effective: EffectivePlan;
  override: PlatformOverride | null;
  subscription: PlatformSubscription | null;
  suspension: { reason: string | null; created_at: string } | null;
};

export type PlatformEvent = {
  id: string;
  name: string;
  slug: string;
  status: string;
  starts_at: string | null;
  created_at: string;
  organization_id: string;
  organization_name: string;
  attendees: number;
  tickets: number;
  suspension: { reason: string | null; created_at: string } | null;
  organization_suspended: boolean;
};

function effectivePlan(
  plans: PlanRow[],
  subscription: PlatformSubscription | null,
  override: PlatformOverride | null,
  now: Date,
): EffectivePlan {
  // Zawsze liczone tak, jakby billing był włączony — panel pokazuje plan, który obowiązuje
  // (albo zacznie obowiązywać po BILLING_ENABLED=true).
  const e = computeEntitlements({
    billingEnabled: true,
    plans,
    subscription,
    override: override as OverrideRow | null,
    now,
  });
  return {
    planKey: e.planKey,
    planName: e.planName,
    source: e.source,
    overrideExpired: Boolean(
      override?.expires_at && new Date(override.expires_at) <= now,
    ),
  };
}

/** E-maile właścicieli z Supabase Auth (stronicowane). */
async function ownerEmails(): Promise<Map<string, string | null>> {
  const admin = createAdminClient();
  const map = new Map<string, string | null>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("[platform] listUsers failed:", error.message);
      break;
    }
    for (const u of data.users) map.set(u.id, u.email ?? null);
    if (data.users.length < 1000) break;
  }
  return map;
}

export async function getPlans(): Promise<PlanRow[]> {
  const { data, error } = await createAdminClient()
    .from("plans")
    .select("key, name, sort_order, is_active, features, limits")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`plans read failed: ${error.message}`);
  return (data ?? []) as PlanRow[];
}

async function getEventCounts(
  eventIds: string[],
): Promise<Map<string, { attendees: number; tickets: number }>> {
  if (eventIds.length === 0) return new Map();
  const { data, error } = await createAdminClient().rpc("platform_event_counts", {
    p_event_ids: eventIds,
  });
  if (error) throw new Error(`platform_event_counts failed: ${error.message}`);
  const map = new Map<string, { attendees: number; tickets: number }>();
  for (const row of (data ?? []) as { event_id: string; attendees: number; tickets: number }[]) {
    map.set(row.event_id, { attendees: Number(row.attendees), tickets: Number(row.tickets) });
  }
  return map;
}

export async function listOrganizations(): Promise<PlatformOrganization[]> {
  const admin = createAdminClient();
  const [orgs, events, subs, overrides, suspensions, plans, emails] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, slug, owner_user_id, billing_email, created_at")
      .order("created_at", { ascending: false })
      .range(0, 4999),
    admin.rpc("platform_org_event_counts"),
    admin
      .from("subscriptions")
      .select("organization_id, plan_key, status, current_period_end, stripe_subscription_id")
      .range(0, 4999),
    admin
      .from("entitlement_overrides")
      .select("organization_id, plan_key, features, limits, reason, expires_at, updated_at")
      .range(0, 4999),
    admin.from("organization_suspensions").select("organization_id, reason, created_at").range(0, 4999),
    getPlans(),
    ownerEmails(),
  ]);
  for (const res of [orgs, events, subs, overrides, suspensions]) {
    if (res.error) throw new Error(`platform read failed: ${res.error.message}`);
  }

  const eventCount = new Map<string, number>();
  for (const row of (events.data ?? []) as { organization_id: string; events: number }[]) {
    eventCount.set(row.organization_id, Number(row.events));
  }
  const subBy = new Map((subs.data ?? []).map((s) => [s.organization_id as string, s]));
  const ovBy = new Map((overrides.data ?? []).map((o) => [o.organization_id as string, o]));
  const susBy = new Map((suspensions.data ?? []).map((s) => [s.organization_id as string, s]));
  const now = new Date();

  return (orgs.data ?? []).map((o) => {
    const subscription = (subBy.get(o.id) ?? null) as PlatformSubscription | null;
    const override = (ovBy.get(o.id) ?? null) as PlatformOverride | null;
    const suspension = susBy.get(o.id) ?? null;
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      owner_user_id: o.owner_user_id,
      owner_email: emails.get(o.owner_user_id) ?? null,
      billing_email: o.billing_email,
      created_at: o.created_at,
      event_count: eventCount.get(o.id) ?? 0,
      effective: effectivePlan(plans, subscription, override, now),
      override,
      subscription,
      suspension: suspension
        ? { reason: suspension.reason, created_at: suspension.created_at }
        : null,
    };
  });
}

export async function getOrganization(id: string): Promise<PlatformOrganization | null> {
  const all = await listOrganizations();
  return all.find((o) => o.id === id) ?? null;
}

export async function listEvents(organizationId?: string): Promise<PlatformEvent[]> {
  const admin = createAdminClient();
  let query = admin
    .from("events")
    .select("id, name, slug, status, starts_at, created_at, organization_id, organizations(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1000); // limit PostgREST — wystarczający na MVP
  if (organizationId) query = query.eq("organization_id", organizationId);

  const [events, eventSus, orgSus] = await Promise.all([
    query,
    admin.from("event_suspensions").select("event_id, reason, created_at").range(0, 9999),
    admin.from("organization_suspensions").select("organization_id").range(0, 4999),
  ]);
  for (const res of [events, eventSus, orgSus]) {
    if (res.error) throw new Error(`platform read failed: ${res.error.message}`);
  }

  const counts = await getEventCounts((events.data ?? []).map((e) => e.id as string));
  const susBy = new Map((eventSus.data ?? []).map((s) => [s.event_id as string, s]));
  const suspendedOrgs = new Set((orgSus.data ?? []).map((s) => s.organization_id as string));

  return (events.data ?? []).map((e) => {
    const org = e.organizations as unknown as { name: string } | null;
    const s = susBy.get(e.id);
    const c = counts.get(e.id);
    return {
      id: e.id,
      name: e.name,
      slug: e.slug,
      status: e.status,
      starts_at: e.starts_at,
      created_at: e.created_at,
      organization_id: e.organization_id,
      organization_name: org?.name ?? "—",
      attendees: c?.attendees ?? 0,
      tickets: c?.tickets ?? 0,
      suspension: s ? { reason: s.reason, created_at: s.created_at } : null,
      organization_suspended: suspendedOrgs.has(e.organization_id),
    };
  });
}

export type AuditEntry = {
  id: number;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export async function listAuditLog(limit = 200): Promise<AuditEntry[]> {
  const { data, error } = await createAdminClient()
    .from("super_admin_audit_log")
    .select("id, actor_email, action, target_type, target_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`audit read failed: ${error.message}`);
  return (data ?? []) as AuditEntry[];
}
