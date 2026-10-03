import type { Metadata } from "next";
import { signOut } from "@/app/(organizer)/actions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Konto zawieszone", robots: { index: false } };

export default function SuspendedPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo variant="adaptive" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Konto zawieszone</h1>
        <p className="text-sm text-muted-foreground">
          Dostęp do panelu organizatora został wstrzymany. Jeśli uważasz, że to pomyłka,
          skontaktuj się z nami.
        </p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Wyloguj
        </Button>
      </form>
    </main>
  );
}
