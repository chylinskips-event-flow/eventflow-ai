import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NetworkingToggle } from "./networking-toggle";

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

  const fullName = [attendee.first_name, attendee.last_name]
    .filter(Boolean)
    .join(" ");
  const initials = [attendee.first_name?.[0], attendee.last_name?.[0]]
    .filter(Boolean)
    .join("");
  const role = [attendee.job_title, attendee.company]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Link
        href={`/e/${slug}/attendees`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Uczestnicy
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Twój profil</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-2 text-center">
          <Avatar className="size-16">
            <AvatarFallback className="text-lg">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          {fullName && (
            <span className="text-lg font-semibold">{fullName}</span>
          )}
          {role && (
            <span className="text-sm text-muted-foreground">{role}</span>
          )}
          {attendee.industry && (
            <Badge variant="secondary">{attendee.industry}</Badge>
          )}
          {attendee.interests && attendee.interests.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1">
              {attendee.interests.map((interest) => (
                <span
                  key={interest}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}
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
