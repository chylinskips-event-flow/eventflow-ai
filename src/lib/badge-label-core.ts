// Etykieta identyfikatora z recepcji (Niimbot B1) — czysta logika: rozmiar etykiety, dopasowanie
// tekstu, komunikaty drukarki. Bez canvas i bez Bluetooth, testowalne w Node.

export type BadgeLabelData = {
  name: string;
  company: string | null;
  eventName: string;
  /** Adres wymiany kontaktów — ten sam, co w kodzie QR na identyfikatorach PDF. */
  qrUrl: string;
};

export type BadgeLabelResult = { ok: true; label: BadgeLabelData } | { ok: false; error: string };

/** Etykieta 50×30 mm na B1 (203 dpi, 8 px/mm): jedyny szeroki rozmiar potwierdzony na tej drukarce. */
export const B1_LABEL_SIZE = { w_px: 384, h_px: 240, offset_y_px: 4, dpi: 203 };
export const B1_PRINTER_MODEL = { name_prefixes: ["B1"], task: "b1", density: 3, label_type: 1, speed: 1 };

export type FittedText = { size: number; lines: string[] };
type Measure = (text: string, size: number) => number;

function wrap(text: string, maxWidth: number, size: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsize(text: string, maxWidth: number, size: number, measure: Measure): string {
  if (measure(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * Największy rozmiar z `sizes` (od największego), przy którym tekst mieści się w `maxLines`
 * wierszach. Gdy nie mieści się nawet najmniejszy, nadmiar kończy się wielokropkiem.
 */
export function fitText(
  text: string,
  opts: { maxWidth: number; maxLines: number; sizes: number[] },
  measure: Measure,
): FittedText {
  const { maxWidth, maxLines, sizes } = opts;
  for (const size of sizes) {
    const lines = wrap(text, maxWidth, size, measure);
    if (lines.length <= maxLines && lines.every((l) => measure(l, size) <= maxWidth)) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  const all = wrap(text, maxWidth, size, measure);
  const lines = all.slice(0, maxLines);
  const last = lines.length - 1;
  if (last >= 0) lines[last] = ellipsize(all.slice(last).join(" "), maxWidth, size, measure);
  return { size, lines: lines.map((l) => ellipsize(l, maxWidth, size, measure)) };
}

export const PRINTER_UNSUPPORTED_MESSAGE =
  "Ta przeglądarka nie obsługuje drukarek Bluetooth. Użyj Chrome lub Edge na komputerze albo telefonie z Androidem (iPhone i Firefox nie działają).";

/** Komunikat dla recepcji; null, gdy osoba sama zamknęła okno wyboru drukarki. */
export function printerErrorMessage(error: unknown): string | null {
  const e = error as { name?: string; message?: string } | null;
  const name = e?.name ?? "";
  const message = e?.message ?? "";
  if (name === "NotFoundError" && /cancel/i.test(message)) return null;
  if (name === "NotFoundError") return "Nie znaleziono drukarki. Włącz B1 i Bluetooth, a na Androidzie także lokalizację.";
  if (name === "SecurityError" || name === "NotAllowedError") return "Przeglądarka nie pozwoliła połączyć się z drukarką. Kliknij „Drukuj” jeszcze raz.";
  if (/not connected|gatt|disconnected/i.test(message)) return "Połączenie z drukarką zostało przerwane. Sprawdź, czy B1 jest włączona, i kliknij „Drukuj” jeszcze raz.";
  return "Drukarka nie potwierdziła wydruku. Sprawdź etykiety i pokrywę; część etykiety mogła się już wydrukować.";
}
