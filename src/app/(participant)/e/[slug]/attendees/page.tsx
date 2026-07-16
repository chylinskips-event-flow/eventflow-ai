import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedMatches } from "@/lib/matchmaking";
import { getContactStatesForEvent } from "@/lib/contact-requests";
import type { Attendee } from "@/lib/attendees";
import { Button } from "@/components/ui/button";
import { AttendeeList, type AttendeeListItem } from "./attendee-list";
import {
  RecommendedContacts,
  type RecommendedMatch,
} from "./recommended-contacts";

const REFRESH_LIMIT_MIN = 60;

function normalizeStr(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

// Fallback uzasadnienia gdy reason z LLM jest NULL — wyliczony z danych obu
// profili (wspólne zainteresowania, potem branża).
function buildFallbackReason(self: Attendee, other: Attendee): string {
  const otherInterests = new Set((other.interests ?? []).map(normalizeStr));
  const common = (self.interests ?? []).filter((interest) =>
    otherInterests.has(normalizeStr(interest)),
  );
  if (common.length > 0) {
    return `Łączy Was: ${common.join(", ")}`;
  }
  if (
    self.industry &&
    other.industry &&
    normalizeStr(self.industry) === normalizeStr(other.industry)
  ) {
    return `Wspólna branża: ${other.industry}`;
  }
  return "Podobne cele uczestnictwa.";
}

export default async function AttendeesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const attendee = await getCurrentAttendee(slug);

  if (!attendee) {
    redirect(`/e/${slug}`);
  }

  const event = await getEventBySlugForRegistration(slug);

  if (!event) {
    redirect(`/e/${slug}`);
  }

  // Service_role: lista uczestników jest poza zasięgiem anon key (RLS by ją
  // ukryła). Tożsamość pytającego ustalona już przez getCurrentAttendee z
  // cookie — tutaj tylko czytamy zatwierdzonych i widocznych networkingowo,
  // plus zawsze samego siebie (nawet z networking_visible=false).
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("attendees")
    .select(
      "id, first_name, last_name, company, job_title, industry, interests, looking_for, avatar_url, networking_visible",
    )
    .eq("event_id", event.id)
    .eq("status", "approved")
    .or(`networking_visible.eq.true,id.eq.${attendee.id}`)
    .order("last_name", { ascending: true });

  const rows = (data ?? []) as AttendeeListItem[];

  // Self pierwszy, reszta alfabetycznie po last_name (zapytanie już sortuje).
  const attendees = [
    ...rows.filter((row) => row.id === attendee.id),
    ...rows.filter((row) => row.id !== attendee.id),
  ];

  // Sekcja "Polecane kontakty" — CZYSTY odczyt cache (zero LLM tutaj).
  const cachedMatches = await getCachedMatches(event.id, attendee.id);
  const recommended: RecommendedMatch[] = cachedMatches.map((match) => ({
    id: match.attendee.id,
    first_name: match.attendee.first_name,
    last_name: match.attendee.last_name,
    company: match.attendee.company,
    job_title: match.attendee.job_title,
    industry: match.attendee.industry,
    interests: match.attendee.interests ?? [],
    looking_for: match.attendee.looking_for,
    avatar_url: match.attendee.avatar_url,
    reason: match.reason ?? buildFallbackReason(attendee, match.attendee),
  }));

  // Stan przycisku kontaktu dla całej siatki — JEDNO zapytanie zwracające mapę
  // otherId → stan, zamiast odpytywania per karta (N+1).
  const contactStates = await getContactStatesForEvent(event.id, attendee.id);

  let minutesUntilRefresh = 0;
  if (attendee.matches_generated_at) {
    const elapsedMin =
      (Date.now() - new Date(attendee.matches_generated_at).getTime()) / 60000;
    minutesUntilRefresh = Math.max(0, Math.ceil(REFRESH_LIMIT_MIN - elapsedMin));
  }

  // ŚWIADOMY WYJĄTEK od standardu max-w-2xl stron uczestnika: to strona
  // przeglądowa — siatka kart do skanowania (lg:grid-cols-3), której 2xl by
  // nie pomieściło. Pozostałe podstrony uczestnika trzymają max-w-2xl.
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={`/e/${slug}`}>
          <ArrowLeft className="size-4" /> Powrót
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold">Uczestnicy – {event.name}</h1>
      <RecommendedContacts
        slug={slug}
        matches={recommended}
        hasGenerated={attendee.matches_generated_at !== null}
        minutesUntilRefresh={minutesUntilRefresh}
      />
      <AttendeeList
        slug={slug}
        attendees={attendees}
        currentAttendeeId={attendee.id}
        contactStates={contactStates}
      />
    </main>
  );
}
