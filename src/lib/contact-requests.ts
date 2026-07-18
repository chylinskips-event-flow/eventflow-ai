import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee } from "@/lib/attendees";

export type ContactRequestStatus = "pending" | "accepted" | "declined";

/**
 * Stan karty uczestnika na liście /attendees, policzony server-side.
 *
 * Uwaga na brakujący wariant: odmowa PRZYCHODZĄCA (ja odrzuciłem) ma własny
 * stan, ale odmowa WYCHODZĄCA (mnie odrzucono) świadomie mapuje się na
 * "outgoing_pending" — requester nigdy nie dowiaduje się o odmowie. Efekt
 * uboczny jest zamierzony: przycisk zostaje wyłączony, więc nie da się
 * ponawiać prośby po odmowie.
 */
export type ContactCardState =
  | { kind: "none" }
  | { kind: "outgoing_pending" }
  | { kind: "incoming_pending" }
  | { kind: "accepted" }
  | { kind: "declined" };

// Druga strona kontaktu w kształcie potrzebnym kartom (bez pól, których
// odbiorca nie ma prawa widzieć — email dokładany osobno, tylko po accepted).
export type ContactParty = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  avatar_url: string | null;
};

export type IncomingRequest = {
  id: string;
  created_at: string;
  requester: ContactParty;
};

export type OutgoingRequest = {
  id: string;
  created_at: string;
  recipient: ContactParty;
};

export type EstablishedContact = {
  id: string;
  responded_at: string | null;
  /** Cel całej wymiany — ujawniany wyłącznie po zaakceptowaniu. */
  email: string | null;
  /** Notatka NALEŻĄCA DO PYTAJĄCEGO (jego własna kolumna), nigdy cudza. */
  myNote: string | null;
  party: ContactParty;
};

const PARTY_FIELDS = "id, first_name, last_name, company, job_title, avatar_url";
const REQUESTER_EMBED = `requester:attendees!contact_requests_requester_id_fkey(${PARTY_FIELDS}, email)`;
const RECIPIENT_EMBED = `recipient:attendees!contact_requests_recipient_id_fkey(${PARTY_FIELDS}, email)`;

type Row = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: ContactRequestStatus;
  requester_note: string | null;
  recipient_note: string | null;
  created_at: string;
  responded_at: string | null;
  requester: (ContactParty & { email: string | null }) | null;
  recipient: (ContactParty & { email: string | null }) | null;
};

function toParty(row: ContactParty & { email: string | null }): ContactParty {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    company: row.company,
    job_title: row.job_title,
    avatar_url: row.avatar_url,
  };
}

/**
 * Wszystkie prośby eventu dotykające danego uczestnika w OBIE strony —
 * JEDNYM zapytaniem, z dociągniętymi profilami obu stron.
 *
 * service_role: contact_requests ma RLS bez polityk (anon key nie widzi nic).
 * Tożsamość pytającego jest już ustalona przez getCurrentAttendee() zanim tu
 * wejdziemy — attendeeId nigdy nie pochodzi od klienta.
 */
async function getRowsForAttendee(
  eventId: string,
  attendeeId: string,
): Promise<Row[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("contact_requests")
    .select(`*, ${REQUESTER_EMBED}, ${RECIPIENT_EMBED}`)
    .eq("event_id", eventId)
    .or(`requester_id.eq.${attendeeId},recipient_id.eq.${attendeeId}`)
    .order("created_at", { ascending: false });

  return (data ?? []) as Row[];
}

/**
 * Znajduje uczestnika po contact_code w obrębie danego eventu.
 *
 * Zawężenie do eventId jest granicą bezpieczeństwa: kod z innego wydarzenia
 * jest dla tej trasy "nieprawidłowy", a nie oknem na cudzy event. Zwraca tylko
 * zatwierdzonych (approved) — kodu niezatwierdzonego uczestnika nie honorujemy.
 */
export async function getAttendeeByContactCode(
  code: string,
  eventId: string,
): Promise<Attendee | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("attendees")
    .select("*")
    .eq("contact_code", code)
    .eq("event_id", eventId)
    .eq("status", "approved")
    .maybeSingle();

  return (data as Attendee | null) ?? null;
}

/**
 * Mapa attendeeId drugiej strony → stan karty, dla całej siatki /attendees.
 *
 * JEDNO zapytanie na stronę zamiast jednego na kartę (N+1) — karty dostają
 * gotowy stan propsem i nie odpytują niczego same.
 */
export async function getContactStatesForEvent(
  eventId: string,
  attendeeId: string,
): Promise<Record<string, ContactCardState>> {
  const rows = await getRowsForAttendee(eventId, attendeeId);
  const states: Record<string, ContactCardState> = {};

  for (const row of rows) {
    const outgoing = row.requester_id === attendeeId;
    const otherId = outgoing ? row.recipient_id : row.requester_id;

    if (row.status === "accepted") {
      states[otherId] = { kind: "accepted" };
    } else if (row.status === "declined") {
      // Tylko odmowa, którą sam wydałem, jest dla mnie widoczna. Odmowa mojej
      // własnej prośby udaje "wysłano" — patrz komentarz przy ContactCardState.
      states[otherId] = outgoing ? { kind: "outgoing_pending" } : { kind: "declined" };
    } else {
      states[otherId] = outgoing
        ? { kind: "outgoing_pending" }
        : { kind: "incoming_pending" };
    }
  }

  return states;
}

export type ContactSections = {
  /** Czekają na MOJĄ odpowiedź. Bez requester_note — notatki są prywatne. */
  incoming: IncomingRequest[];
  /** Nawiązane kontakty (obie strony razem — kierunek już nieistotny). */
  contacts: EstablishedContact[];
  /**
   * Wysłane i niezaakceptowane. pending i declined celowo w JEDNYM worku i bez
   * pola status: requester nie dowiaduje się o odmowie, więc UI nie ma czego
   * rozróżniać — a czego nie ma w propsach, tego nie da się przypadkiem pokazać.
   */
  outgoing: OutgoingRequest[];
};

/**
 * Komplet danych strony /contacts — JEDNYM zapytaniem, podział na sekcje
 * w pamięci (trzy osobne odczyty to byłyby trzy round-tripy po ten sam zbiór).
 *
 * Ujawnia email drugiej strony wyłącznie w `contacts` (po akceptacji) — to cel
 * wymiany, dozwolony dopiero po zgodzie. Notatka wychodzi wyłącznie ta
 * z kolumny należącej do pytającego; cudza nie opuszcza serwera.
 */
export async function getContactSections(
  eventId: string,
  attendeeId: string,
): Promise<ContactSections> {
  const rows = await getRowsForAttendee(eventId, attendeeId);
  const sections: ContactSections = { incoming: [], contacts: [], outgoing: [] };

  for (const row of rows) {
    if (!row.requester || !row.recipient) continue;
    const outgoing = row.requester_id === attendeeId;

    if (row.status === "accepted") {
      const other = outgoing ? row.recipient : row.requester;
      sections.contacts.push({
        id: row.id,
        responded_at: row.responded_at,
        email: other.email,
        myNote: outgoing ? row.requester_note : row.recipient_note,
        party: toParty(other),
      });
    } else if (outgoing) {
      sections.outgoing.push({
        id: row.id,
        created_at: row.created_at,
        recipient: toParty(row.recipient),
      });
    } else if (row.status === "pending") {
      sections.incoming.push({
        id: row.id,
        created_at: row.created_at,
        requester: toParty(row.requester),
      });
    }
    // Pozostaje: przychodząca declined (ja odrzuciłem) — nie pokazujemy jej
    // nigdzie, żeby skrzynka nie stała się archiwum odmów.
  }

  return sections;
}
