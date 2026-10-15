import { ShieldOff } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutPartner } from "./actions";

/** Konto partnera, którego każdy dostęp unieważnił organizator (revoked_at). */
export function PartnerAccessRevoked({ email }: { email: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldOff className="size-5" />
          </div>
          <CardTitle>Dostęp do panelu partnera został cofnięty</CardTitle>
          <CardDescription>Skontaktuj się z organizatorem wydarzenia.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {email && <p className="text-muted-foreground">Zalogowano jako {email}.</p>}
          <form action={signOutPartner}>
            <Button type="submit" variant="outline">Wyloguj</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
