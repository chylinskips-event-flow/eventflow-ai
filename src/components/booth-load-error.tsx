import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * #10 Faza A2 — dane logistyki stoisk nie wczytały się (np. niezastosowana migracja).
 * Celowo widoczny błąd zamiast pustego „Brak wniosku”.
 */
export function BoothLoadError({ title, hint }: { title: string; hint: string }) {
  return (
    <Card role="alert" className="border-destructive/40">
      <CardContent className="flex items-start gap-3 py-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export const BOOTH_ERROR_TITLE = "Nie udało się wczytać wniosku";
export const BOOTH_ERROR_HINT_PARTNER = "Odśwież stronę. Jeśli błąd się powtarza, daj znać organizatorowi.";
export const BOOTH_ERROR_HINT_ORGANIZER =
  "Odśwież stronę. Jeśli błąd się powtarza, sprawdź, czy migracje logistyki stoisk (20261016…) są zastosowane w bazie.";
