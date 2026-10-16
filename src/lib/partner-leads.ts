// #10 Faza B — odczyty i zapisy (service_role po autoryzacji w wywołującym).
// Każda funkcja zakłada, że wywołujący sprawdził flagę (isPartnerLeadsEnabled) i uprawnienia.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PARTNER_DELETED_NOTE,
  parseQuestionOptions,
  partnerLeadsEnabled,
  type PartnerLead,
  type PublicQuestion,
  type QuestionKind,
  type QuestionStatus,
} from "@/lib/partner-leads-core";

export function isPartnerLeadsEnabled(): boolean {
  return partnerLeadsEnabled({
    PARTNER_LEADS_ENABLED: process.env.PARTNER_LEADS_ENABLED,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}

function logError(
  scope: string,
  error: { code?: string; message: string } | null,
) {
  if (error)
    console.error(
      `[partner-leads] ${scope}`,
      JSON.stringify({ code: error.code, message: error.message }),
    );
}

// ── Audyt ──────────────────────────────────────────────────────────────────

export type LeadAuditAction =
  | "consent_given"
  | "consent_withdrawn"
  | "leads_viewed"
  | "leads_exported"
  | "question_submitted"
  | "question_deleted"
  | "question_approved"
  | "question_rejected";

/**
 * Wpis audytu. Błąd zapisu logujemy, ale nie przerywamy akcji użytkownika — z wyjątkiem
 * eksportu leadów, gdzie wywołujący sprawdza wynik (brak śladu = brak eksportu).
 */
export async function logLeadAudit(entry: {
  eventId: string;
  partnerId: string;
  actorType: "attendee" | "partner" | "organizer";
  actorUserId?: string | null;
  attendeeId?: string | null;
  action: LeadAuditAction;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("partner_lead_audit")
    .insert({
      event_id: entry.eventId,
      partner_id: entry.partnerId,
      actor_type: entry.actorType,
      actor_user_id: entry.actorUserId ?? null,
      attendee_id: entry.attendeeId ?? null,
      action: entry.action,
      metadata: entry.metadata ?? {},
    });
  logError("audit insert failed", error);
  return !error;
}

export type LeadAuditEntry = {
  id: string;
  actor_type: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function getLeadAudit(
  partnerId: string,
  limit = 50,
): Promise<LeadAuditEntry[]> {
  const { data, error } = await createAdminClient()
    .from("partner_lead_audit")
    .select("id, actor_type, action, metadata, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  logError("audit read failed", error);
  return (data ?? []) as LeadAuditEntry[];
}

// ── Pytania ────────────────────────────────────────────────────────────────

export type PartnerQuestion = PublicQuestion & {
  status: QuestionStatus;
  review_note: string | null;
  position: number;
};

export async function getPartnerQuestions(
  partnerId: string,
  opts: { approvedOnly?: boolean } = {},
): Promise<PartnerQuestion[]> {
  let q = createAdminClient()
    .from("partner_questions")
    .select("id, kind, prompt, options, status, review_note, position")
    .eq("partner_id", partnerId);
  if (opts.approvedOnly) q = q.eq("status", "approved");
  const { data, error } = await q
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  logError("questions read failed", error);
  return (data ?? [])
    .filter(
      (r) =>
        !(r.status === "rejected" && r.review_note === PARTNER_DELETED_NOTE),
    )
    .map((r) => ({
      id: r.id as string,
      kind: r.kind as QuestionKind,
      prompt: r.prompt as string,
      options: parseQuestionOptions(r.options),
      status: r.status as QuestionStatus,
      review_note: (r.review_note as string | null) ?? null,
      position: (r.position as number) ?? 0,
    }));
}

/** Pytania czekające na organizatora, per partner (do licznika „Do akceptacji”). */
export async function getPendingQuestionCounts(
  eventId: string,
): Promise<Record<string, number>> {
  const { data, error } = await createAdminClient()
    .from("partner_questions")
    .select("partner_id")
    .eq("event_id", eventId)
    .eq("status", "pending");
  logError("pending questions read failed", error);
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { partner_id: string }[])
    counts[r.partner_id] = (counts[r.partner_id] ?? 0) + 1;
  return counts;
}

// ── Zgody ──────────────────────────────────────────────────────────────────

export async function getActiveConsent(
  partnerId: string,
  attendeeId: string,
): Promise<{ id: string; given_at: string } | null> {
  const { data, error } = await createAdminClient()
    .from("partner_lead_consents")
    .select("id, given_at")
    .eq("partner_id", partnerId)
    .eq("attendee_id", attendeeId)
    .is("withdrawn_at", null)
    .maybeSingle();
  logError("consent read failed", error);
  return (data as { id: string; given_at: string } | null) ?? null;
}

export type AttendeeConsent = {
  id: string;
  partnerId: string;
  partnerName: string;
  givenAt: string;
};

/** Aktywne zgody uczestnika (profil → wycofanie). */
export async function getAttendeeConsents(
  attendeeId: string,
): Promise<AttendeeConsent[]> {
  const { data, error } = await createAdminClient()
    .from("partner_lead_consents")
    .select(
      "id, partner_id, given_at, partners!partner_lead_consents_partner_id_fkey(name)",
    )
    .eq("attendee_id", attendeeId)
    .is("withdrawn_at", null)
    .order("given_at", { ascending: false });
  logError("attendee consents read failed", error);
  return (
    (data ?? []) as unknown as {
      id: string;
      partner_id: string;
      given_at: string;
      partners: { name: string } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    partnerId: r.partner_id,
    partnerName: r.partners?.name ?? "Partner",
    givenAt: r.given_at,
  }));
}

/**
 * Wycofanie zgody: usunięcie odpowiedzi + withdrawn_at (wiersz zgody zostaje jako dowód,
 * że zgoda była i kiedy ją wycofano). Zwraca event/partnera do audytu albo null.
 */
export async function withdrawConsent(
  consentId: string,
  attendeeId: string,
): Promise<{ eventId: string; partnerId: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partner_lead_consents")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", consentId)
    .eq("attendee_id", attendeeId)
    .is("withdrawn_at", null)
    .select("event_id, partner_id")
    .maybeSingle();
  logError("consent withdraw failed", error);
  if (!data) return null;
  const { error: delError } = await admin
    .from("partner_question_answers")
    .delete()
    .eq("consent_id", consentId);
  logError("answers delete failed", delError);
  return {
    eventId: data.event_id as string,
    partnerId: data.partner_id as string,
  };
}

// ── Leady ──────────────────────────────────────────────────────────────────

type ConsentRow = {
  id: string;
  given_at: string;
  consent_version: string;
  attendees: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    company: string | null;
    job_title: string | null;
  } | null;
  partner_question_answers:
    | { prompt: string; answer: string; created_at: string }[]
    | null;
};

/** Leady partnera: wyłącznie aktywne (niewycofane) zgody, z odpowiedziami. */
export async function getPartnerLeads(
  partnerId: string,
): Promise<PartnerLead[]> {
  const { data, error } = await createAdminClient()
    .from("partner_lead_consents")
    .select(
      "id, given_at, consent_version, " +
        "attendees!partner_lead_consents_attendee_id_fkey(first_name, last_name, email, company, job_title), " +
        "partner_question_answers!partner_question_answers_consent_id_fkey(prompt, answer, created_at)",
    )
    .eq("partner_id", partnerId)
    .is("withdrawn_at", null)
    .order("given_at", { ascending: false });
  logError("leads read failed", error);
  return ((data ?? []) as unknown as ConsentRow[]).map((r) => ({
    consentId: r.id,
    givenAt: r.given_at,
    consentVersion: r.consent_version,
    firstName: r.attendees?.first_name ?? null,
    lastName: r.attendees?.last_name ?? null,
    email: r.attendees?.email ?? null,
    company: r.attendees?.company ?? null,
    jobTitle: r.attendees?.job_title ?? null,
    answers: [...(r.partner_question_answers ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ prompt, answer }) => ({ prompt, answer })),
  }));
}

/** Liczba aktywnych leadów (bez danych osobowych — do licznika przed „Pokaż leady”). */
export async function getPartnerLeadCount(partnerId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("partner_lead_consents")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .is("withdrawn_at", null);
  logError("lead count failed", error);
  return count ?? 0;
}

/** Aktywne (niewycofane) zgody Fazy B per partner — licznik leadów na liście partnerów. */
export async function getActiveLeadCounts(eventId: string): Promise<Record<string, number>> {
  const { data, error } = await createAdminClient()
    .from("partner_lead_consents")
    .select("partner_id")
    .eq("event_id", eventId)
    .is("withdrawn_at", null);
  logError("lead counts read failed", error);
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { partner_id: string }[]) counts[r.partner_id] = (counts[r.partner_id] ?? 0) + 1;
  return counts;
}
