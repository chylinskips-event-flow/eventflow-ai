import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentAttendee } from "@/lib/attendee-session";
import {
  getEventBySlugForRegistration,
  DEFAULT_INTEREST_OPTIONS,
} from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NetworkingToggle } from "./networking-toggle";
import { ProfileForm } from "./profile-form";
import { AvatarUpload } from "./avatar-upload";

export default async function ProfilePage({
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

  const fullName = [attendee.first_name, attendee.last_name]
    .filter(Boolean)
    .join(" ");
  const initials = [attendee.first_name?.[0], attendee.last_name?.[0]]
    .filter(Boolean)
    .join("");

  // Lista chipów = opcje eventu (lub domyślne) + wartości historyczne
  // uczestnika spoza tej listy, żeby zaznaczone zainteresowania nie znikały.
  const baseInterests = event?.interest_options ?? DEFAULT_INTEREST_OPTIONS;
  const currentInterests = attendee.interests ?? [];
  const extraInterests = currentInterests.filter(
    (interest) => !baseInterests.includes(interest),
  );
  const interestOptions = [...baseInterests, ...extraInterests];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={`/e/${slug}/attendees`}>
          <ArrowLeft className="size-4" /> Powrót
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Dane konta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 py-2 text-center">
          {fullName && (
            <span className="text-lg font-semibold">{fullName}</span>
          )}
          <p className="text-sm text-muted-foreground">
            Aby zmienić dane osobowe, skontaktuj się z organizatorem.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profil networkingowy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvatarUpload
            slug={slug}
            initialAvatarUrl={attendee.avatar_url}
            initials={initials}
          />
          <ProfileForm
            slug={slug}
            interestOptions={interestOptions}
            company={attendee.company}
            jobTitle={attendee.job_title}
            industry={attendee.industry}
            interests={currentInterests}
            goal={attendee.goal}
            lookingFor={attendee.looking_for}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ustawienia networkingu</CardTitle>
        </CardHeader>
        <CardContent>
          <NetworkingToggle
            slug={slug}
            initialVisible={attendee.networking_visible}
          />
        </CardContent>
      </Card>
    </main>
  );
}
