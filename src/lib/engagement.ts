// Q&A, ankiety i oceny sesji — odczyty (service_role).
// KAŻDĄ funkcję wywoływać dopiero po autoryzacji: getCurrentAttendee() (uczestnik),
// getOwnEvent() (organizator) albo tokenem rzutnika (getQaProjectorState).
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parsePollOptions,
  pollResults,
  publicAuthorName,
  ratingSummary,
  sortQuestions,
  type PollOptionResult,
  type PollStatus,
  type QuestionStatus,
  type RatingSummary,
} from "@/lib/engagement-core";

type AttendeeName = { first_name: string | null; last_name: string | null; company: string | null };

type QuestionRow = {
  id: string;
  session_id: string;
  attendee_id: string;
  content: string;
  status: QuestionStatus;
  vote_count: number;
  is_anonymous: boolean;
  created_at: string;
  attendees: AttendeeName | null;
};

type PollRow = {
  id: string;
  session_id: string | null;
  question: string;
  options: unknown;
  status: PollStatus;
  created_at: string;
};

export type PollView = {
  id: string;
  question: string;
  status: PollStatus;
  results: PollOptionResult[];
  total: number;
  created_at: string;
};

async function pollCounts(pollIds: string[]): Promise<Map<string, Record<string, number>>> {
  const map = new Map<string, Record<string, number>>();
  if (pollIds.length === 0) return map;
  const { data, error } = await createAdminClient().rpc("poll_option_counts", {
    p_poll_ids: pollIds,
  });
  if (error) throw new Error(`poll_option_counts failed: ${error.message}`);
  for (const row of (data ?? []) as { poll_id: string; option_id: string; votes: number }[]) {
    const counts = map.get(row.poll_id) ?? {};
    counts[row.option_id] = Number(row.votes);
    map.set(row.poll_id, counts);
  }
  return map;
}

function toPollView(poll: PollRow, counts: Record<string, number> | undefined): PollView {
  const { results, total } = pollResults(parsePollOptions(poll.options), counts ?? {});
  return { id: poll.id, question: poll.question, status: poll.status, results, total, created_at: poll.created_at };
}

// ── Uczestnik ──────────────────────────────────────────────────────────────

export type ParticipantQuestion = {
  id: string;
  content: string;
  status: Exclude<QuestionStatus, "hidden">;
  vote_count: number;
  created_at: string;
  author: string | null;
  is_mine: boolean;
  has_voted: boolean;
};

export type ParticipantEngagement = {
  questions: ParticipantQuestion[];
  myQuestionCount: number;
  /** Otwarta ankieta sesji (najnowsza). Wyniki widoczne dopiero po oddaniu głosu. */
  poll: (PollView & { myOptionId: string | null }) | null;
  myFeedback: { rating: number; comment: string | null } | null;
};

export async function getParticipantEngagement(
  sessionId: string,
  attendeeId: string,
): Promise<ParticipantEngagement> {
  const admin = createAdminClient();
  const [questionsRes, votesRes, pollRes, feedbackRes] = await Promise.all([
    admin
      .from("questions")
      .select("id, session_id, attendee_id, content, status, vote_count, is_anonymous, created_at, attendees(first_name, last_name, company)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(1000),
    admin
      .from("question_votes")
      .select("question_id, questions!inner(session_id)")
      .eq("attendee_id", attendeeId)
      .eq("questions.session_id" as never, sessionId),
    admin
      .from("polls")
      .select("id, session_id, question, options, status, created_at")
      .eq("session_id", sessionId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("feedback")
      .select("rating, comment")
      .eq("session_id", sessionId)
      .eq("attendee_id", attendeeId)
      .maybeSingle(),
  ]);
  if (questionsRes.error) throw new Error(`questions read failed: ${questionsRes.error.message}`);

  const rows = (questionsRes.data ?? []) as unknown as QuestionRow[];
  const voted = new Set((votesRes.data ?? []).map((v) => v.question_id as string));

  const questions = sortQuestions(rows.filter((q) => q.status !== "hidden")).map(
    (q): ParticipantQuestion => ({
      id: q.id,
      content: q.content,
      status: q.status as ParticipantQuestion["status"],
      vote_count: q.vote_count,
      created_at: q.created_at,
      author: publicAuthorName(q.is_anonymous, q.attendees),
      is_mine: q.attendee_id === attendeeId,
      has_voted: voted.has(q.id),
    }),
  );

  let poll: ParticipantEngagement["poll"] = null;
  const pollRow = pollRes.data as PollRow | null;
  if (pollRow) {
    const [counts, answer] = await Promise.all([
      pollCounts([pollRow.id]),
      admin
        .from("poll_answers")
        .select("selected_option_id")
        .eq("poll_id", pollRow.id)
        .eq("attendee_id", attendeeId)
        .maybeSingle(),
    ]);
    poll = { ...toPollView(pollRow, counts.get(pollRow.id)), myOptionId: answer.data?.selected_option_id ?? null };
  }

  return {
    questions,
    myQuestionCount: rows.filter((q) => q.attendee_id === attendeeId).length,
    poll,
    myFeedback: feedbackRes.data
      ? { rating: feedbackRes.data.rating, comment: feedbackRes.data.comment }
      : null,
  };
}

// ── Organizator ────────────────────────────────────────────────────────────

export type SessionEngagementSummary = {
  session_id: string;
  questions: number;
  visible_questions: number;
  ratings: number;
  avg_rating: number | null;
  open_polls: number;
};

export async function getEventEngagementSummary(
  eventId: string,
): Promise<Map<string, SessionEngagementSummary>> {
  const { data, error } = await createAdminClient().rpc("session_engagement_summary", {
    p_event_id: eventId,
  });
  if (error) throw new Error(`session_engagement_summary failed: ${error.message}`);
  const map = new Map<string, SessionEngagementSummary>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    map.set(r.session_id as string, {
      session_id: r.session_id as string,
      questions: Number(r.questions),
      visible_questions: Number(r.visible_questions),
      ratings: Number(r.ratings),
      avg_rating: r.avg_rating == null ? null : Number(r.avg_rating),
      open_polls: Number(r.open_polls),
    });
  }
  return map;
}

export type OrganizerQuestion = {
  id: string;
  content: string;
  status: QuestionStatus;
  vote_count: number;
  is_anonymous: boolean;
  created_at: string;
  /** Pełny autor — organizator widzi go także przy pytaniach anonimowych. */
  author: string;
};

export type OrganizerFeedback = {
  rating: number;
  comment: string | null;
  author: string;
  created_at: string;
};

export type OrganizerEngagement = {
  questions: OrganizerQuestion[];
  polls: PollView[];
  feedback: OrganizerFeedback[];
  rating: RatingSummary;
};

function fullName(a: AttendeeName | null) {
  if (!a) return "—";
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";
  return a.company ? `${name} (${a.company})` : name;
}

export async function getOrganizerEngagement(sessionId: string): Promise<OrganizerEngagement> {
  const admin = createAdminClient();
  const [questionsRes, pollsRes, feedbackRes] = await Promise.all([
    admin
      .from("questions")
      .select("id, session_id, attendee_id, content, status, vote_count, is_anonymous, created_at, attendees(first_name, last_name, company)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(1000),
    admin
      .from("polls")
      .select("id, session_id, question, options, status, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
    admin
      .from("feedback")
      .select("rating, comment, created_at, attendees(first_name, last_name, company)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  for (const r of [questionsRes, pollsRes, feedbackRes]) {
    if (r.error) throw new Error(`engagement read failed: ${r.error.message}`);
  }

  const questionRows = (questionsRes.data ?? []) as unknown as QuestionRow[];
  const pollRows = (pollsRes.data ?? []) as PollRow[];
  const counts = await pollCounts(pollRows.map((p) => p.id));
  const feedbackRows = (feedbackRes.data ?? []) as unknown as {
    rating: number;
    comment: string | null;
    created_at: string;
    attendees: AttendeeName | null;
  }[];

  return {
    questions: sortQuestions(questionRows).map((q) => ({
      id: q.id,
      content: q.content,
      status: q.status,
      vote_count: q.vote_count,
      is_anonymous: q.is_anonymous,
      created_at: q.created_at,
      author: fullName(q.attendees),
    })),
    polls: pollRows.map((p) => toPollView(p, counts.get(p.id))),
    feedback: feedbackRows.map((f) => ({
      rating: f.rating,
      comment: f.comment,
      author: fullName(f.attendees),
      created_at: f.created_at,
    })),
    rating: ratingSummary(feedbackRows.map((f) => f.rating)),
  };
}

// ── Rzutnik ────────────────────────────────────────────────────────────────

export type QaProjectorState = {
  sessionId: string;
  eventSlug: string;
  sessionTitle: string;
  eventName: string;
  room: string | null;
  primaryColor: string | null;
  selected: { id: string; content: string; author: string | null; vote_count: number } | null;
  questions: { id: string; content: string; author: string | null; vote_count: number }[];
  poll: PollView | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stan ekranu rzutnika po tokenie (publiczny, tylko do odczytu; token = dostęp, jak rzutnik Mixera).
 * Zawieszony event/organizacja albo event poza published/live → null (404).
 */
export async function getQaProjectorState(token: string): Promise<QaProjectorState | null> {
  if (!UUID.test(token)) return null;
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, title, room, event_id, events!inner(id, name, slug, status, primary_color, organization_id, deleted_at)")
    .eq("qa_present_token", token)
    .maybeSingle();
  if (!session) return null;

  const event = session.events as unknown as {
    id: string;
    name: string;
    slug: string;
    status: string;
    primary_color: string | null;
    organization_id: string;
    deleted_at: string | null;
  };
  if (event.deleted_at || (event.status !== "published" && event.status !== "live")) return null;

  const [eventSus, orgSus] = await Promise.all([
    admin.from("event_suspensions").select("event_id").eq("event_id", event.id).maybeSingle(),
    admin.from("organization_suspensions").select("organization_id").eq("organization_id", event.organization_id).maybeSingle(),
  ]);
  if (eventSus.data || orgSus.data) return null;

  const [questionsRes, pollRes] = await Promise.all([
    admin
      .from("questions")
      .select("id, session_id, attendee_id, content, status, vote_count, is_anonymous, created_at, attendees(first_name, last_name, company)")
      .eq("session_id", session.id)
      .in("status", ["pending", "selected"])
      .limit(1000),
    admin
      .from("polls")
      .select("id, session_id, question, options, status, created_at")
      .eq("session_id", session.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = sortQuestions((questionsRes.data ?? []) as unknown as QuestionRow[]);
  const toView = (q: QuestionRow) => ({
    id: q.id,
    content: q.content,
    author: publicAuthorName(q.is_anonymous, q.attendees),
    vote_count: q.vote_count,
  });
  const selected = rows.find((q) => q.status === "selected") ?? null;

  let poll: PollView | null = null;
  const pollRow = pollRes.data as PollRow | null;
  if (pollRow) {
    const counts = await pollCounts([pollRow.id]);
    poll = toPollView(pollRow, counts.get(pollRow.id));
  }

  return {
    sessionId: session.id,
    eventSlug: event.slug,
    sessionTitle: session.title,
    eventName: event.name,
    room: session.room,
    primaryColor: event.primary_color,
    selected: selected ? toView(selected) : null,
    questions: rows.filter((q) => q.status === "pending").slice(0, 8).map(toView),
    poll,
  };
}
