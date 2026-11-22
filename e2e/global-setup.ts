// Dane testowe w LOKALNEJ bazie (po `supabase db reset`): organizator z organizacją,
// cztery wydarzenia (otwarta rejestracja, z zatwierdzaniem, z biletami, szkic), sesje,
// prelegenci, partner i typy biletów. Identyfikatory trafiają do e2e/.state.json.
import { FAKE_RESEND_URL } from "./env";
import { admin, saveState, type SeedState } from "./helpers";

const ORGANIZER = "organizator@e2e.test";
const PARTNER = "partner@e2e.test";

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wyniki supabase-js mają różne kształty
async function must(label: string, p: PromiseLike<{ data: any; error: { message: string } | null }>): Promise<any> {
  const { data, error } = await p;
  if (error || data === null || data === undefined) throw new Error(`[seed] ${label}: ${error?.message ?? "brak danych"}`);
  return data;
}

export default async function globalSetup() {
  const db = admin();
  await fetch(`${FAKE_RESEND_URL}/__messages`, { method: "DELETE" }).catch(() => {});

  const { data: existing } = await db.from("organizations").select("id").eq("slug", "e2e-org").maybeSingle();
  if (existing) {
    throw new Error("[seed] Dane E2E już są w bazie — uruchom przez `npm run e2e` (resetuje lokalną bazę).");
  }

  const user = await must("organizator", db.auth.admin.createUser({ email: ORGANIZER, email_confirm: true }));
  const org = await must(
    "organizacja",
    db.from("organizations").insert({ name: "E2E Organizator", slug: "e2e-org", owner_user_id: user.user.id, billing_email: ORGANIZER }).select("id").single(),
  );

  const base = {
    organization_id: org.id,
    timezone: "Europe/Warsaw",
    starts_at: at(7, 8),
    ends_at: at(7, 16),
    location: "Łódź, Hala Expo",
    room_names: ["Sala A", "Sala B"],
    gamification_enabled: true,
  };
  const insertEvent = (slug: string, name: string, extra: Record<string, unknown>) =>
    must(`wydarzenie ${slug}`, db.from("events").insert({ ...base, slug, name, ...extra }).select("id, slug, name").single());

  const open = await insertEvent("e2e-otwarte", "E2E Konferencja Otwarta", { status: "published", requires_approval: false });
  const approval = await insertEvent("e2e-zatwierdzanie", "E2E Konferencja z Akceptacją", { status: "published", requires_approval: true });
  const tickets = await insertEvent("e2e-bilety", "E2E Konferencja z Biletami", { status: "published", requires_approval: false });
  const draft = await insertEvent("e2e-szkic", "E2E Szkic", { status: "draft", requires_approval: false });

  const speakers = await must(
    "prelegenci",
    db.from("speakers").insert([
      { event_id: open.id, first_name: "Anna", last_name: "Prelegentka", company: "Firma A" },
      { event_id: open.id, first_name: "Piotr", last_name: "Mówca", company: "Firma B" },
    ]).select("id"),
  );
  const sessions = await must(
    "sesje",
    db.from("sessions").insert([
      { event_id: open.id, title: "Otwarcie konferencji", room: "Sala A", starts_at: at(7, 8), ends_at: at(7, 9) },
      { event_id: open.id, title: "Panel o przyszłości miast", room: "Sala B", starts_at: at(7, 9), ends_at: at(7, 10) },
    ]).select("id, title"),
  );
  await must(
    "prelegenci sesji",
    db.from("session_speakers").insert([
      { session_id: sessions[0].id, speaker_id: speakers[0].id },
      { session_id: sessions[1].id, speaker_id: speakers[1].id },
    ]).select("session_id"),
  );
  const partner = await must(
    "partner",
    db.from("partners").insert({ event_id: open.id, name: "Partner E2E", tier: "gold", description: "Partner testowy" }).select("id, qr_code_token").single(),
  );
  const ticketTypes = await must(
    "bilety",
    db.from("ticket_types").insert([
      { event_id: tickets.id, name: "Wejściówka darmowa", price: 0, quantity_total: 50 },
      { event_id: tickets.id, name: "Bilet VIP", price: 10000, quantity_total: 10 },
    ]).select("id, price"),
  );

  const state: SeedState = {
    organizerEmail: ORGANIZER,
    partnerEmail: PARTNER,
    events: { open, approval, tickets, draft },
    sessionId: sessions[1].id,
    partnerId: partner.id,
    partnerQrToken: partner.qr_code_token,
    freeTicketId: ticketTypes.find((t: { price: number }) => t.price === 0)!.id,
  };
  saveState(state);
}
