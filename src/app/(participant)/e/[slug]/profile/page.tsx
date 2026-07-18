import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentAttendee } from "@/lib/attendee-session";
import {
  getEventBySlugForRegistration,
  DEFAULT_INTEREST_OPTIONS,
} from "@/lib/events";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactQr } from "../contact-qr";
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
  const role = [attendee.job_title, attendee.company]
    .filter(Boolean)
    .join(" · ");

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
      <h1 className="text-2xl font-semibold">Twój profil</h1>

      {/* Wizytówka — podgląd "jak widzą mnie inni". Tylko wyświetla dane, które
          i tak są na stronie; edycja niżej. Mobile: kolumna wyśrodkowana,
          sm+: avatar po lewej, dane po prawej. */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar className="size-24 shrink-0">
            {attendee.avatar_url && (
              <AvatarImage src={attendee.avatar_url} alt={fullName} />
            )}
            <AvatarFallback className="text-2xl">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
            <span className="text-2xl font-semibold">
              {fullName || "Uczestnik"}
            </span>
            {role && <span className="text-muted-foreground">{role}</span>}
            {attendee.industry && (
              <Badge variant="secondary">{attendee.industry}</Badge>
            )}
            {currentInterests.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
                {currentInterests.map((interest) => (
                  <span
                    key={interest}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Kod kontaktowy jako "bilet" — wyróżniony kolorystycznie, QR wyśrodkowany. */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>Twój kod kontaktowy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <ContactQr
            slug={slug}
            contactCode={attendee.contact_code}
            size={240}
            className="rounded-lg border bg-background p-2"
          />
          <p className="max-w-xs text-sm text-muted-foreground">
            Pokaż ten kod osobie, którą poznasz — po zeskanowaniu nawiążecie
            kontakt.
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
          <CardTitle>Dane konta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 py-2 text-center">
          <p className="text-sm text-muted-foreground">
            Aby zmienić dane osobowe, skontaktuj się z organizatorem.
          </p>
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
