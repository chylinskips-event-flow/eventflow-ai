import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, getInviteByToken } from "@/lib/partner-portal";
import { maskEmail } from "@/lib/partner-portal-core";
import { getCurrentTimestamp } from "@/lib/format";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutPartner } from "../../actions";
import { InviteLoginButton } from "./invite-login-button";

export default async function PartnerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getInviteByToken(token), getAuthUser()]);

  const shell = (title: string, body: React.ReactNode, description?: string) => (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">{body}</CardContent>
      </Card>
    </main>
  );

  if (!invite) {
    return shell(
      "Zaproszenie nieaktualne",
      <p className="text-muted-foreground">
        Link jest nieprawidłowy albo zaproszenie zostało unieważnione. Poproś organizatora o nowe.
      </p>,
    );
  }

  const { access, partnerName, event } = invite;
  if (user && access.user_id === user.id) redirect(`/partner/${access.partner_id}`);
  if (user && user.email === access.email) redirect("/partner");

  const description = `${partnerName} · ${event.name}`;
  if (access.user_id) {
    return shell(
      "Zaproszenie zostało już przyjęte",
      <Button asChild className="w-fit"><Link href="/partner/login">Zaloguj się</Link></Button>,
      description,
    );
  }
  if (new Date(access.invite_expires_at).getTime() <= getCurrentTimestamp()) {
    return shell(
      "Zaproszenie wygasło",
      <p className="text-muted-foreground">Poproś organizatora wydarzenia o ponowne wysłanie zaproszenia.</p>,
      description,
    );
  }
  if (user) {
    return shell(
      "Zalogowano na inny adres",
      <>
        <p className="text-muted-foreground">
          Jesteś zalogowany(-a) jako {user.email}, a zaproszenie jest dla {maskEmail(access.email)}.
          Wyloguj się i otwórz link ponownie.
        </p>
        <form action={signOutPartner}>
          <Button type="submit" variant="outline">Wyloguj</Button>
        </form>
      </>,
      description,
    );
  }

  return shell(
    "Zaproszenie do panelu partnera",
    <>
      <p>
        Organizator wydarzenia <strong>{event.name}</strong> zaprasza firmę <strong>{partnerName}</strong> do
        panelu partnera: wizytówka, oferta dla uczestników i materiały do pobrania.
      </p>
      <p className="text-muted-foreground">
        Wyślemy jednorazowy link logowania na {maskEmail(access.email)}. Po kliknięciu w link trafisz
        prosto do panelu.
      </p>
      <InviteLoginButton token={token} />
    </>,
    description,
  );
}
