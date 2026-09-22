import { redirect } from "next/navigation";
import { MicVocal } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventSpeakersForParticipant } from "@/lib/speakers";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionHero, SectionHeroMedia } from "@/components/participant/section-hero";
import { SpeakerBio } from "../speaker-bio";

export default async function SpeakersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const attendee = await getCurrentAttendee(slug);
  if (!attendee) redirect(`/e/${slug}`);

  const event = await getEventBySlugForRegistration(slug);
  if (!event) redirect(`/e/${slug}`);

  const speakers = await getEventSpeakersForParticipant(event.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Poznaj"
        headlineAccent="prelegentów"
        subtitle="Eksperci, którzy dzielą się wiedzą i doświadczeniem."
        media={<SectionHeroMedia icon={MicVocal} />}
      />

      {speakers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MicVocal className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Organizator nie dodał jeszcze prelegentów.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {speakers.map((speaker) => {
            const fullName =
              [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || "—";
            const initials =
              [speaker.first_name?.[0], speaker.last_name?.[0]]
                .filter(Boolean)
                .join("")
                .toUpperCase() || "?";

            return (
              <Card key={speaker.id}>
                <CardContent className="flex flex-col items-center gap-2 py-5 text-center">
                  <Avatar className="h-16 w-16">
                    {speaker.photo_url && (
                      <AvatarImage src={speaker.photo_url} alt={fullName} />
                    )}
                    <AvatarFallback className="text-lg font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{fullName}</span>
                    {speaker.company && (
                      <span className="text-sm text-muted-foreground">
                        {speaker.company}
                      </span>
                    )}
                  </div>
                  {speaker.bio && <SpeakerBio bio={speaker.bio} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
