import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { claimPendingInvites, getAuthUser, getMyPartnerMemberships } from "@/lib/partner-portal";
import { formatDate } from "@/lib/format";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signOutPartner } from "./actions";

export default async function PartnerHomePage() {
  const user = await getAuthUser();
  if (!user) redirect("/partner/login");

  // Zaproszenia na adres potwierdzony logowaniem → aktywny dostęp.
  await claimPendingInvites(user);
  const memberships = await getMyPartnerMemberships(user.id);
  if (memberships.length === 1) redirect(`/partner/${memberships[0].partner.id}`);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <form action={signOutPartner}>
          <Button variant="ghost" size="sm" type="submit">Wyloguj</Button>
        </form>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Panel partnera</h1>
        <p className="mt-1 text-sm text-muted-foreground">Zalogowano jako {user.email}</p>
      </div>
      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ten adres nie ma aktywnego dostępu do żadnego panelu partnera. Jeśli dostałeś(-aś)
            zaproszenie, mogło wygasnąć albo zostać unieważnione — poproś organizatora o nowe.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {memberships.map((m) => (
            <li key={m.accessId}>
              <Link href={`/partner/${m.partner.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                      {m.partner.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.partner.logo_url} alt="" className="size-full object-contain" />
                      ) : (
                        <Building2 className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.partner.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.event.name}
                        {m.event.starts_at ? ` · ${formatDate(m.event.starts_at, m.event.timezone)}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
