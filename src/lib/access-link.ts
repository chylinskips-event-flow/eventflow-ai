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

/** ilike bez symboli wieloznacznych — porównanie adresu bez względu na wielkość liter. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

/**
 * „Wejdź ponownie” z prawdziwymi zależnościami (Supabase, Resend, after()). Wspólne dla
 * formularza /e/{slug}/wejdz i dla ponownej rejestracji na ten sam adres (te same limity).
 */
export async function requestAccessLinkForEmail(params: {
  slug: string;
  email: unknown;
  headers: Headers;
}): Promise<AccessLinkState> {
  const origin = getOrigin(params.headers);
  const supabase = createAdminClient();

  return requestAccessLinkCore(
    {
      findEvent: getEventBySlugForRegistration,
      isSuspended: isEventSuspended,
      // Sprawdzenie limitu i zapis w jednej transakcji (migracja 20261124120000).
      tryRecord: async ({ eventId, emailHash, ipHash, since, maxPerEmail, maxPerIp }) => {
        const { data, error } = await supabase.rpc("try_record_access_link_request", {
          p_event_id: eventId,
          p_email_hash: emailHash,
          p_ip_hash: ipHash,
          p_since: since.toISOString(),
          p_max_email: maxPerEmail,
          p_max_ip: maxPerIp,
        });
        if (error) throw error;
        return data === true;
      },
      purge: async (before) => {
        const { error } = await supabase.from(TABLE).delete().lt("created_at", before.toISOString());
        if (error) throw error;
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
    { slug: params.slug, email: params.email, ip: clientIpFromHeaders(params.headers) },
  );
}
