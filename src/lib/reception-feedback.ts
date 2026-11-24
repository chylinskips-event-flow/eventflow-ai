// Wspólne dla panelu recepcji i skanera QR (bez zależności serwerowych — używane w komponentach
// klienckich). Link obsługi wyłączony w trakcie zmiany: akcje zwracają „link_inactive” zamiast
// rzucać wyjątek, a interfejs pokazuje komunikat i przestaje wysyłać kolejne żądania.

export const RECEPTION_LINK_INACTIVE_TITLE = "Link nieaktywny";
export const RECEPTION_LINK_INACTIVE_MESSAGE =
  "Ten link recepcji wygasł lub został wyłączony przez organizatora. Poproś organizatora o nowy link.";
export const RECEPTION_ACTION_ERROR_MESSAGE =
  "Nie udało się zapisać zmiany. Sprawdź połączenie i spróbuj ponownie.";

export const QR_SCAN_ERROR_MESSAGE = "Nie udało się przetworzyć skanu. Spróbuj ponownie.";

export type LinkInactiveResult = { ok: false; error: "link_inactive" };
export type UndoCheckInResult = { ok: true } | LinkInactiveResult;

export function isLinkInactive(result: unknown): result is LinkInactiveResult {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { ok?: unknown }).ok === false &&
    (result as { error?: unknown }).error === "link_inactive"
  );
}
