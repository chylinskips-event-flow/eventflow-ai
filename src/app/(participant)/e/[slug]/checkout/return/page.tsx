import { headers } from "next/headers";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CheckoutReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const { slug } = await params;
  const { sessionId } = await searchParams;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";

  if (!sessionId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 sm:px-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Nieprawidlowe zamowienie</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={eventRoot}>Wróć do strony wydarzenia</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("status, buyer_email, buyer_name")
    .eq("p24_session_id", sessionId)
    .maybeSingle();

  const status = order?.status ?? "unknown";

  if (status === "paid") {
    const firstName = order!.buyer_name.split(" ")[0];
    const email = order!.buyer_email;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-16 text-green-500" />
          <h1 className="text-2xl font-bold">Platnosc potwierdzona!</h1>
          <p className="max-w-sm text-muted-foreground">
            Dzieki, {firstName}! Twoj bilet zostal wystawiony i wyslany na adres{" "}
            <strong>{email}</strong>.
          </p>
        </div>
        <Button asChild>
          <Link href={eventRoot}>Przejdz do strony wydarzenia</Link>
        </Button>
      </main>
    );
  }

  if (status === "failed" || status === "cancelled") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="size-16 text-destructive" />
          <h1 className="text-2xl font-bold">Platnosc nieudana</h1>
          <p className="max-w-sm text-muted-foreground">
            Platnosc nie zostala zrealizowana. Zadne srodki nie zostaly pobrane.
            Mozesz sprobowac ponownie.
          </p>
        </div>
        <Button asChild>
          <Link href={`${eventRoot}#register`}>Sprobuj ponownie</Link>
        </Button>
      </main>
    );
  }

  // pending or unknown — webhook not yet received
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Clock className="size-16 text-amber-500" />
        <h1 className="text-2xl font-bold">Przetwarzamy platnosc</h1>
        <p className="max-w-sm text-muted-foreground">
          Potwierdzenie platnosci jest w drodze. Wyslemy Ci bilet mailem, gdy
          tylko otrzymamy potwierdzenie od Przelewy24 (zwykle kilka sekund).
        </p>
        <p className="text-xs text-muted-foreground">
          Jesli nie dostaniesz emaila w ciagu kilku minut, sprawdz folder spam
          lub skontaktuj sie z organizatorem.
        </p>
      </div>
      <Button asChild>
        <Link href={eventRoot}>Przejdz do strony wydarzenia</Link>
      </Button>
    </main>
  );
}
