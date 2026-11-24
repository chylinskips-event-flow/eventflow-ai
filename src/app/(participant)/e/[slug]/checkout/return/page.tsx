import { cookies, headers } from "next/headers";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { CHECKOUT_SESSION_COOKIE, isOwnCheckoutSession } from "@/lib/checkout-return";
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
            <CardTitle>Nieprawidłowe zamówienie</CardTitle>
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
    // Przeglądarka, która rozpoczęła płatność, przechodzi do panelu uczestnika (logowanie jak po
    // bilecie darmowym). Inna przeglądarka — strona wydarzenia, dostęp przez link z maila.
    const ownSession = isOwnCheckoutSession(
      (await cookies()).get(CHECKOUT_SESSION_COOKIE)?.value,
      sessionId,
    );
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-16 text-green-500" />
          <h1 className="text-2xl font-bold">Płatność potwierdzona!</h1>
          <p className="max-w-sm text-muted-foreground">
            Dzięki, {firstName}! Bilet wysłaliśmy na adres <strong>{email}</strong>. W wiadomości
            znajdziesz kod QR i link do panelu uczestnika.
          </p>
        </div>
        <Button asChild>
          {ownSession ? (
            <Link
              href={buildEventInternalPath(
                slug,
                `/checkout/return/panel?sessionId=${encodeURIComponent(sessionId)}`,
                origin,
              )}
              prefetch={false}
            >
              Przejdź do panelu uczestnika
            </Link>
          ) : (
            <Link href={eventRoot}>Przejdź do strony wydarzenia</Link>
          )}
        </Button>
      </main>
    );
  }

  if (status === "paid_overbooked") {
    // Płatność potwierdzona, ale bez wolnego miejsca (pula wyczerpana po wygaśnięciu rezerwacji
    // albo limit uczestników wydarzenia): bez biletu, organizator dostał powiadomienie
    // i skontaktuje się w sprawie zwrotu.
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Clock className="size-16 text-amber-500" />
          <h1 className="text-2xl font-bold">Płatność przyjęta, brak wolnych miejsc</h1>
          <p className="max-w-sm text-muted-foreground">
            W chwili potwierdzenia płatności na wydarzeniu nie było już wolnych miejsc.
            Bilet nie został wystawiony. Organizator otrzymał powiadomienie i skontaktuje się
            z Tobą w sprawie zwrotu płatności.
          </p>
        </div>
        <Button asChild>
          <Link href={eventRoot}>Przejdź do strony wydarzenia</Link>
        </Button>
      </main>
    );
  }

  if (status === "failed" || status === "cancelled") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="size-16 text-destructive" />
          <h1 className="text-2xl font-bold">Płatność nieudana</h1>
          <p className="max-w-sm text-muted-foreground">
            Płatność nie została zrealizowana. Żadne środki nie zostały pobrane.
            Możesz spróbować ponownie.
          </p>
        </div>
        <Button asChild>
          <Link href={`${eventRoot}#register`}>Spróbuj ponownie</Link>
        </Button>
      </main>
    );
  }

  // pending or unknown — webhook not yet received
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Clock className="size-16 text-amber-500" />
        <h1 className="text-2xl font-bold">Przetwarzamy płatność</h1>
        <p className="max-w-sm text-muted-foreground">
          Potwierdzenie płatności jest w drodze. Wyślemy Ci bilet mailem, gdy
          tylko otrzymamy potwierdzenie od Przelewy24 (zwykle kilka sekund).
        </p>
        <p className="text-xs text-muted-foreground">
          Jeśli nie dostaniesz e-maila w ciągu kilku minut, sprawdź folder spam
          lub skontaktuj się z organizatorem.
        </p>
      </div>
      <Button asChild>
        <Link href={eventRoot}>Przejdź do strony wydarzenia</Link>
      </Button>
    </main>
  );
}
