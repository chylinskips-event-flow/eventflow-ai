// Połączenie przez skan kodu QR, gdy para ma już wiersze kontaktu. UNIQUE na contact_requests
// jest kierunkowy, więc para może mieć wiersze w obu kierunkach (np. dwie prośby wysłane
// jednocześnie). Skan zostawia JEDEN wiersz 'accepted', a pozostałe usuwa — inaczej kontakt
// pokazywałby się podwójnie i liczył dwa razy do questów. Notatki z usuwanych wierszy
// przenosimy do zachowanego, jeśli tam pole tej osoby jest puste.

export type PairContactRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  requester_note: string | null;
  recipient_note: string | null;
};

export type QrConnectPlan = {
  keepId: string;
  update: {
    status: "accepted";
    responded_at?: string;
    requester_note?: string;
    recipient_note?: string;
  };
  deleteIds: string[];
};

/** Plan dla istniejących wierszy pary (co najmniej jeden) — bez zapytań do bazy. */
export function planQrConnect(rows: PairContactRow[], scannerId: string, now: string): QrConnectPlan {
  if (rows.length === 0) throw new Error("planQrConnect: brak wierszy");
  const keep =
    rows.find((r) => r.status === "accepted") ??
    rows.find((r) => r.requester_id === scannerId) ??
    rows[0];

  const update: QrConnectPlan["update"] = { status: "accepted" };
  if (keep.status !== "accepted") update.responded_at = now;

  let requesterNote = keep.requester_note;
  let recipientNote = keep.recipient_note;
  const others = rows.filter((r) => r.id !== keep.id);

  for (const other of others) {
    const notes: [string, string | null][] = [
      [other.requester_id, other.requester_note],
      [other.recipient_id, other.recipient_note],
    ];
    for (const [author, note] of notes) {
      if (!note) continue;
      if (author === keep.requester_id && !requesterNote) {
        requesterNote = note;
        update.requester_note = note;
      } else if (author === keep.recipient_id && !recipientNote) {
        recipientNote = note;
        update.recipient_note = note;
      }
    }
  }

  return { keepId: keep.id, update, deleteIds: others.map((r) => r.id) };
}
