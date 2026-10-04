import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getModeratorPanelData, resolveModeratorLink } from "@/lib/moderator";
import { getModeratorSessionEngagement } from "@/lib/engagement";
import { groupByTier, pickFocusSession } from "@/lib/moderator-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay, formatTimeRange, getCurrentTimestamp } from "@/lib/format";
import { ModeratorPanel, type PanelSession } from "./moderator-panel";

// Panel prowadzącego sali — dostęp = znajomość tokenu linku (unieważnialnego przez
// organizatora). Bez konta; zawieszony event/organizacja, plan bez live_qa → 404.

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const ctx = await resolveModeratorLink(token);
  return {
    title: ctx ? `${ctx.event.name} — panel prowadzącego` : "Panel prowadzącego",
    robots: { index: false, follow: false },
  };
}

export default async function ModeratorPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { s } = await searchParams;
  const ctx = await resolveModeratorLink(token);
  if (!ctx) notFound();

  const data = await getModeratorPanelData(ctx);
  const tz = ctx.event.timezone;
  const focus = pickFocusSession(data.sessions, typeof s === "string" ? s : null, getCurrentTimestamp());

  const [engagement, tokenRes] = focus
    ? await Promise.all([
        getModeratorSessionEngagement(focus.id),
        createAdminClient().from("sessions").select("qa_present_token").eq("id", focus.id).maybeSingle(),
      ])
    : [null, null];

  const sessions: PanelSession[] = data.sessions.map((x) => ({
    id: x.id,
    title: x.title,
    description: x.description,
    room: x.room,
    track: x.track,
    starts_at: x.starts_at,
    ends_at: x.ends_at,
    day: formatDay(x.starts_at, tz),
    time: formatTimeRange(x.starts_at, x.ends_at, tz),
    speakers: x.speakers.map(({ speaker, role }) => ({
      id: speaker.id,
      name: [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || "Prelegent",
      company: speaker.company,
      photo_url: speaker.photo_url,
      role,
    })),
    note: data.notes.bySession[x.id] ?? "",
  }));

  return (
    <ModeratorPanel
      token={token}
      eventName={ctx.event.name}
      linkLabel={ctx.link.label}
      room={ctx.link.room}
      canProject={ctx.event.status === "published" || ctx.event.status === "live"}
      sessions={sessions}
      focusId={focus?.id ?? null}
      engagement={engagement}
      projectorToken={(tokenRes?.data?.qa_present_token as string | undefined) ?? null}
      alerts={data.alerts.map((a) => ({
        id: a.id,
        content: a.content,
        room: a.room,
        is_important: a.is_important,
        announced: !!a.announced_at,
      }))}
      script={data.notes.script}
      partnerGroups={groupByTier(data.partners)}
    />
  );
}
