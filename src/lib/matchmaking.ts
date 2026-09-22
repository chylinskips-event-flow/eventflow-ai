import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee } from "@/lib/attendees";

const anthropic = new Anthropic(); // czyta ANTHROPIC_API_KEY ze środowiska

// Wartości goal pochodzą z GOAL_OPTIONS w register-form.tsx:
//   networking | wiedza-branzowa | poszukiwanie-dostawcow | inne
const GOAL_NETWORKING = "networking";
const GOAL_SUPPLIERS = "poszukiwanie-dostawcow";
const GOAL_OTHER = "inne";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Punkty za komplementarność celów udziału.
 * - "poszukiwanie dostawców" ↔ "inne"/"networking" w TEJ SAMEJ branży: +20
 *   (ktoś szuka dostawców trafia na kogoś z tej branży) — priorytet.
 * - w przeciwnym razie któryś cel = "networking": +10 (networking pasuje do
 *   wszystkiego, ale liczy się lżej).
 * - inaczej: 0.
 */
function goalScore(
  goalA: string | null,
  goalB: string | null,
  sameIndustry: boolean,
): number {
  const a = normalize(goalA);
  const b = normalize(goalB);
  const goals = new Set([a, b]);

  if (
    sameIndustry &&
    goals.has(GOAL_SUPPLIERS) &&
    (goals.has(GOAL_OTHER) || goals.has(GOAL_NETWORKING))
  ) {
    return 20;
  }

  if (a === GOAL_NETWORKING || b === GOAL_NETWORKING) {
    return 10;
  }

  return 0;
}

/**
 * Rule-based scoring dopasowania dwóch uczestników. Symetryczne:
 * computeMatchScore(a, b) === computeMatchScore(b, a).
 * - +10 za każde wspólne zainteresowanie,
 * - +15 gdy ta sama branża (case-insensitive, trim),
 * - komplementarność celów (patrz goalScore).
 * 0 = brak dopasowania.
 *
 * CELOWA ASYMETRIA: looking_for ("czego szukam") NIE bierze udziału w scoringu.
 * To wolny tekst — nie nadaje się do rule-based porównań (brak wspólnego
 * słownika, synonimy, literówki). Zostaje sygnałem wyłącznie dla LLM w
 * generateMatchReason(), gdzie model potrafi go zinterpretować semantycznie.
 */
export function computeMatchScore(a: Attendee, b: Attendee): number {
  let score = 0;

  const interestsB = new Set((b.interests ?? []).map(normalize));
  for (const interest of a.interests ?? []) {
    if (interestsB.has(normalize(interest))) {
      score += 10;
    }
  }

  const industryA = normalize(a.industry);
  const industryB = normalize(b.industry);
  const sameIndustry = industryA !== "" && industryA === industryB;
  if (sameIndustry) {
    score += 15;
  }

  score += goalScore(a.goal, b.goal, sameIndustry);

  return score;
}

export type MatchSuggestion = {
  attendee: Attendee;
  score: number;
};

/**
 * Ranking najlepszych dopasowań dla danego uczestnika. Liczony na żywo
 * (service_role — tożsamość ustalona server-side przed wywołaniem):
 * bierze wszystkich approved + networking_visible=true z eventu poza samym
 * pytającym, liczy score, sortuje malejąco i zwraca top N ze score > 0.
 * Może zwrócić mniej niż `limit` (albo 0 — wtedy sekcja się nie renderuje).
 */
export async function getTopMatches(
  eventId: string,
  attendeeId: string,
  limit = 3,
): Promise<MatchSuggestion[]> {
  const supabase = createAdminClient();

  const { data: self } = await supabase
    .from("attendees")
    .select("*")
    .eq("id", attendeeId)
    .eq("event_id", eventId)
    .maybeSingle<Attendee>();

  if (!self) {
    return [];
  }

  const { data: others } = await supabase
    .from("attendees")
    .select("*")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .eq("networking_visible", true)
    .neq("id", attendeeId);

  return (others ?? [])
    .map((candidate) => ({
      attendee: candidate as Attendee,
      score: computeMatchScore(self, candidate as Attendee),
    }))
    .filter((match) => match.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

export type CachedMatch = {
  attendee: Attendee;
  score: number;
  reason: string | null;
  first_question: string | null;
};

/**
 * Czysty odczyt cache dopasowań (SELECT + join profili) — ZERO LLM, zero
 * przeliczeń. Używane przez stronę do renderu STANU 2. Service_role, bo RLS
 * ukrywa match_suggestions przed anon.
 */
export async function getCachedMatches(
  eventId: string,
  attendeeId: string,
): Promise<CachedMatch[]> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("match_suggestions")
    .select("suggested_attendee_id, score, reason, first_question")
    .eq("event_id", eventId)
    .eq("attendee_id", attendeeId)
    .order("score", { ascending: false })
    .limit(3);

  if (!rows || rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.suggested_attendee_id as string);
  const { data: profiles } = await supabase
    .from("attendees")
    .select("*")
    .in("id", ids);
  const byId = new Map(
    (profiles ?? []).map((profile) => [
      profile.id as string,
      profile as Attendee,
    ]),
  );

  return rows
    .map((row) => {
      const suggested = byId.get(row.suggested_attendee_id as string);
      return suggested
        ? {
            attendee: suggested,
            score: row.score as number,
            reason: row.reason as string | null,
            first_question: row.first_question as string | null,
          }
        : null;
    })
    .filter((view): view is CachedMatch => view !== null);
}

// Profil przekazywany do LLM — CELOWO bez email (i innych pól, których model
// nie potrzebuje do uzasadnienia).
function llmProfile(attendee: Attendee) {
  const profile: Record<string, unknown> = {
    imię: attendee.first_name,
    nazwisko: attendee.last_name,
    firma: attendee.company,
    stanowisko: attendee.job_title,
    branża: attendee.industry,
    zainteresowania: attendee.interests ?? [],
    cel: attendee.goal,
  };
  // Dodaj tylko gdy niepuste — nie zaśmiecamy promptu null/pustym stringiem.
  if (attendee.looking_for && attendee.looking_for.trim()) {
    profile.czego_szuka = attendee.looking_for.trim();
  }
  return profile;
}

export type MatchInsight = { reason: string | null; first_question: string | null };

/**
 * Parsuje odpowiedź LLM na {reason, first_question}. Trzy poziomy prób:
 * 1. JSON po oczyszczeniu z bloku ```json ... ```.
 * 2. Wyłuskanie pierwszego {...} regexem (obsługa "Oto JSON: {...}").
 * 3. Fallback: cały tekst jako reason, first_question = null.
 * Nigdy nie rzuca wyjątku.
 */
function parseMatchInsight(raw: string): MatchInsight {
  function tryJson(str: string): MatchInsight | null {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === "object") {
        return {
          reason:
            typeof parsed.reason === "string" && parsed.reason.trim()
              ? parsed.reason.trim()
              : null,
          first_question:
            typeof parsed.first_question === "string" &&
            parsed.first_question.trim()
              ? parsed.first_question.trim()
              : null,
        };
      }
    } catch {
      // nie-JSON
    }
    return null;
  }

  // Poziom 1: oczyść ewentualny blok ```json i spróbuj parse
  const cleaned = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const pass1 = tryJson(cleaned);
  if (pass1) return pass1;

  // Poziom 2: wyłuskaj pierwszy {...} (LLM dodał tekst przed/po JSON-ie)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const pass2 = tryJson(jsonMatch[0]);
    if (pass2) return pass2;
  }

  // Poziom 3: fallback — cały tekst jako reason, brak pytania
  const fallback = raw.trim();
  return { reason: fallback || null, first_question: null };
}

/**
 * Generuje uzasadnienie dopasowania i pierwsze pytanie otwierające (po polsku).
 * Zwraca {reason: null, first_question: null} przy dowolnym błędzie API —
 * wywołujący traktuje brak pól jako dopuszczalny stan.
 */
export async function generateMatchReason(
  a: Attendee,
  b: Attendee,
): Promise<MatchInsight> {
  const prompt = `Jesteś asystentem networkingowym na wydarzeniu biznesowym. Na podstawie dwóch profili napisz po polsku:
1. JEDNO zdanie uzasadnienia (maks. 25 słów), dlaczego tym osobom warto porozmawiać. Bez imion, bez powitań, bez cudzysłowów. Jeśli profil zawiera pole czego_szuka, potraktuj je jako najważniejszy sygnał.
2. Konkretne pytanie otwierające rozmowę (maks. 15 słów), dedykowane tej parze — oparte na ich specjalizacji, branży lub celach. Zacznij od "Zapytaj o…". Nie używaj pytań generycznych.

Zwróć TYLKO obiekt JSON — bez markdown, bez \`\`\`json, bez dodatkowego tekstu:
{"reason":"…","first_question":"Zapytaj o …"}

Profil odbiorcy sugestii:
${JSON.stringify(llmProfile(a), null, 2)}

Profil sugerowanej osoby:
${JSON.stringify(llmProfile(b), null, 2)}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content.find((part) => part.type === "text");
    const raw = block && block.type === "text" ? block.text.trim() : "";
    return raw ? parseMatchInsight(raw) : { reason: null, first_question: null };
  } catch (error) {
    console.error("generateMatchReason failed:", error);
    return { reason: null, first_question: null };
  }
}
