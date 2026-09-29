import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getPaymentConfigMasked } from "./actions";
import { PaymentsForm } from "./payments-form";
import { AlertTriangle } from "lucide-react";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();

  const existing = await getPaymentConfigMasked(eventId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Platnosci (Przelewy24)</h2>
        <p className="text-sm text-muted-foreground">
          Konfiguracja bramki platniczej P24 dla tego konta organizatora.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-amber-50 p-4 text-sm dark:bg-amber-950/20">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Testuj wylacznie w sandboxie
          </p>
          <p className="text-amber-700 dark:text-amber-400">
            Klucze produkcyjne wpisz dopiero po pelnych testach w sandboxie P24.
            Regulamin i polityka zwrotow wymagaja aktualizacji prawnej przed uruchomieniem platnosci.
          </p>
        </div>
      </div>

      <PaymentsForm eventId={eventId} existing={existing} />
    </main>
  );
}
