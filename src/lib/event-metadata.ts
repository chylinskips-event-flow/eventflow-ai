import type { Metadata } from "next";

// Szkic nie jest publiczny: metadane strony (tytuł, opis, Open Graph, obraz) nie mogą zdradzać
// nazwy, opisu ani grafiki wydarzenia. Zawieszone wydarzenia middleware zamienia na 404,
// więc tu w ogóle nie trafiają.

export const NEUTRAL_EVENT_TITLE = "Wydarzenie niedostępne";

export const NEUTRAL_EVENT_METADATA: Metadata = {
  title: NEUTRAL_EVENT_TITLE,
  robots: { index: false, follow: false },
};

export function isDraftEvent(event: { status: string }): boolean {
  return event.status === "draft";
}
