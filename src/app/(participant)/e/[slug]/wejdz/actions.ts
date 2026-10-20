"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEventSuspended } from "@/lib/supabase/middleware";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getOrigin } from "@/lib/request-origin";
import { sendAttendeeAccessLinkEmail } from "@/lib/email/attendee-access-link";
import {
  clientIpFromHeaders,
  requestAccessLinkCore,
  type AccessLinkState,
} from "@/lib/access-link-core";

const TABLE = "attendee_access_link_requests";
// Górna granica linków w jednym mailu (kilka rekordów na jeden adres — np. bilety dla zespołu).
const MAX_LINKS_PER_EMAIL = 20;

// ilike bez symboli wieloznacznych — porównanie adresu bez względu na wielkość liter.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

export async function requestAccessLink(
  slug: string,
  _prev: AccessLinkState,
  formData: FormData,
): Promise<AccessLinkState> {
  const headersList = await headers();
  const origin = getOrigin(headersList);
  const supabase = createAdminClient();

  return requestAccessLinkCore(
    {
      findEvent: getEventBySlugForRegistration,
      isSuspended: isEventSuspended,
      countRecent: async ({ emailHash, ipHash, since }) => {
        const [byEmail, byIp] = await Promise.all([
          supabase.from(TABLE).select("id", { count: "exact", head: true })
            .eq("email_hash", emailHash).gte("created_at", since.toISOString()),
          supabase.from(TABLE).select("id", { count: "exact", head: true })
            .eq("ip_hash", ipHash).gte("created_at", since.toISOString()),
        ]);
        if (byEmail.error) throw byEmail.error;
        if (byIp.error) throw byIp.error;
        return { email: byEmail.count ?? 0, ip: byIp.count ?? 0 };
      },
      record: async ({ eventId, emailHash, ipHash, purgeBefore }) => {
        const { error } = await supabase
          .from(TABLE)
          .insert({ event_id: eventId, email_hash: emailHash, ip_hash: ipHash });
        if (error) throw error;
        // Sprzątanie starych wierszy — błąd nie blokuje prośby.
        const purge = await supabase.from(TABLE).delete().lt("created_at", purgeBefore.toISOString());
        if (purge.error) console.warn("[access-link] purge failed:", purge.error.message);
      },
      findApprovedAttendees: async (eventId, email) => {
        const { data, error } = await supabase
          .from("attendees")
          .select("first_name, last_name, email, qr_code_token, created_at")
          .eq("event_id", eventId)
          .eq("status", "approved")
          .ilike("email", escapeLike(email))
          .order("created_at", { ascending: true })
          .limit(MAX_LINKS_PER_EMAIL);
        if (error) throw error;
        return data ?? [];
      },
      sendLinks: ({ attendees, event }) =>
        sendAttendeeAccessLinkEmail({
          to: attendees[0].email,
          eventName: event.name,
          eventSlug: event.slug,
          eventTimezone: event.timezone,
          attendees,
          origin,
        }),
      schedule: (task) => after(task),
      now: () => new Date(),
    },
    { slug, email: formData.get("email"), ip: clientIpFromHeaders(headersList) },
  );
}
