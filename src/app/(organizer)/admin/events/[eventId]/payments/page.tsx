import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { CreditCard, Info } from "lucide-react";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Płatności (Przelewy24)</h2>
        <p className="text-sm text-muted-foreground">
          Konfiguracja bramki płatniczej dla tego wydarzenia.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Integracja P24 — w przygotowaniu</p>
          <p className="text-muted-foreground">
            Konfiguracja kont Przelewy24 (pos_id, merchant_id, klucze API, CRC) zostanie
            dostępna w kolejnej fazie. Bilety darmowe działają już teraz bez płatności.
          </p>
        </div>
      </div>

      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        <div className="text-center">
          <CreditCard className="mx-auto mb-2 size-8 opacity-40" />
          <p className="text-sm">Formularz konfiguracji P24 — wkrótce</p>
        </div>
      </div>
    </div>
  );
}
