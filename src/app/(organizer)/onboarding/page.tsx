import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
import { getPartnerAccountStatus } from "@/lib/partner-portal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OnboardingForm } from "./form";

/** Jawny wybór „zakładam organizację” z ekranu wyboru konta partnera. */
const ORGANIZER_CHOICE_PARAM = "as";
const ORGANIZER_CHOICE_VALUE = "organizer";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
} = {}) {
  const organization = await getOwnOrganization();

  if (organization) {
    redirect("/admin");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = (await searchParams) ?? {};
  const choseOrganizer = params[ORGANIZER_CHOICE_PARAM] === ORGANIZER_CHOICE_VALUE;

  // Konto partnera (także z cofniętym dostępem) trafia tu m.in. z /admin (middleware) i z
  // /auth/callback bez parametru next. Nie przekierowujemy automatycznie na /partner (stamtąd
  // link „panel organizatora” wracał tutaj — pętla), tylko dajemy wybór: panel partnera albo
  // założenie własnej organizacji. Dostęp partnera pozostaje bez zmian.
  if (!choseOrganizer) {
    const partnerStatus = await getPartnerAccountStatus({ id: user.id, email: user.email ?? "" });
    if (partnerStatus !== "none") {
      return <PartnerOrOrganizerChoice email={user.email ?? ""} revoked={partnerStatus !== "active"} />;
    }
  }

  return <OnboardingForm email={user.email ?? ""} />;
}

function PartnerOrOrganizerChoice({ email, revoked }: { email: string; revoked: boolean }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>To konto jest powiązane z panelem partnera</CardTitle>
          <CardDescription>
            {revoked
              ? "Dostęp partnera dla tego adresu wygasł lub został cofnięty."
              : "Ten adres ma dostęp do panelu partnera wydarzenia."}{" "}
            Możesz też założyć własną organizację i tworzyć wydarzenia jako organizator.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {email && (
            <p className="text-xs text-muted-foreground">
              Zalogowano jako <span className="break-all font-medium text-foreground">{email}</span>.
            </p>
          )}
          <Button asChild>
            <Link href={`/onboarding?${ORGANIZER_CHOICE_PARAM}=${ORGANIZER_CHOICE_VALUE}`}>
              Załóż organizację
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/partner">Przejdź do panelu partnera</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
