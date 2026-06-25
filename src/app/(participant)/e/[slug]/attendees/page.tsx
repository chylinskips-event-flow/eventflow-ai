import { redirect } from "next/navigation";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AttendeeList, type AttendeeListItem } from "./attendee-list";

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
      "id, first_name, last_name, company, job_title, industry, interests, networking_visible",
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Uczestnicy — {event.name}</h1>
      <AttendeeList
        slug={slug}
        attendees={attendees}
        currentAttendeeId={attendee.id}
      />
    </main>
  );
}
