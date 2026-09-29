import { headers } from "next/headers";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string; email?: string }>;
}) {
  const { slug } = await params;
  const { name, email } = await searchParams;
  const origin = getOrigin(await headers());
  const firstName = name ? decodeURIComponent(name) : null;
  const emailDecoded = email ? decodeURIComponent(email) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-16 text-green-500" />
        <h1 className="text-2xl font-bold">
          {firstName ? `Gotowe, ${firstName}!` : "Rejestracja zakończona!"}
        </h1>
        <p className="max-w-sm text-muted-foreground">
          Twój bilet jest gotowy.{" "}
          {emailDecoded
            ? `Wyślemy potwierdzenie na adres ${emailDecoded}.`
            : "Wyślemy potwierdzenie na podany adres email."}
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Co dalej?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 size-4 shrink-0" />
            <p>
              Sprawdź skrzynkę e-mail — znajdziesz tam bilet z kodem QR, który
              będzie potrzebny przy wejściu.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={buildEventInternalPath(slug, "", origin) || "/"}>Przejdź do strony wydarzenia</Link>
        </Button>
      </div>
    </main>
  );
}
