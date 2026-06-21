import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getAttendeeByTokenAndSlug,
  ATTENDEE_TOKEN_COOKIE,
  ATTENDEE_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/attendee-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AttendeeAccessPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const attendee = await getAttendeeByTokenAndSlug(token, slug);

  if (!attendee) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link jest nieprawidłowy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Nie znaleźliśmy takiej rejestracji dla tego wydarzenia.
            </p>
            <Button asChild>
              <Link href={`/e/${slug}/register`}>Zarejestruj się</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (attendee.status === "pending") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Rejestracja w trakcie weryfikacji</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Twoja rejestracja wciąż oczekuje na zatwierdzenie przez
              organizatora.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (attendee.status === "rejected") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Brak dostępu</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Rejestracja na to wydarzenie nie została zatwierdzona.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // status === 'approved' — token może pochodzić z innego urządzenia niż to,
  // na którym odbyła się rejestracja (typowy scenariusz: rejestracja na
  // laptopie, skan QR telefonem na evencie), więc cookie ZAWSZE ustawiamy
  // tutaj na nowo, niezależnie od tego, czy już istnieje.
  const cookieStore = await cookies();
  cookieStore.set(ATTENDEE_TOKEN_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/e/${slug}`,
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  });

  redirect(`/e/${slug}`);
}
