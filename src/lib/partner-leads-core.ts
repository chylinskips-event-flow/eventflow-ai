// #10 Faza B — czysta logika (bez I/O): flaga z bramką prawną, treść zgody, walidacja pytań
// i odpowiedzi, wiersze eksportu. Testowana w __tests__/partner-leads-core.test.ts.

// ── Bramka prawna ──────────────────────────────────────────────────────────
/**
 * Treści zgody pokazywane uczestnikowi — dwa warianty: z pytaniami partnera albo sam kontakt
 * (partner bez zaakceptowanych pytań). Każdy ma własną wersję; zgoda w bazie zapisuje wersję
 * i pełny tekst, który uczestnik zobaczył. Zmiana treści = nowa wersja.
 *
 * `legalApproved` obejmuje OBA warianty i przestawia się na true WYŁĄCZNIE po akceptacji
 * obu treści przez prawnika — do tego czasu funkcja nie włączy się na produkcji, nawet
 * z PARTNER_LEADS_ENABLED=true.
 */
export const PARTNER_LEADS_CONSENT = {
  legalApproved: false,
  withQuestions: {
    version: "draft-2026-10",
    text: (partnerName: string, eventName: string) =>
      `Wyrażam zgodę na przekazanie firmie ${partnerName}, partnerowi wydarzenia ${eventName}, ` +
      `moich danych kontaktowych (imię, nazwisko, adres e-mail, firma, stanowisko) oraz odpowiedzi ` +
      `na powyższe pytania, w celu skontaktowania się ze mną w sprawie jej oferty. ` +
      `${partnerName} staje się odrębnym administratorem tych danych. Zgoda jest dobrowolna — ` +
      `jej brak nie wpływa na udział w wydarzeniu ani na punkty. Możesz ją wycofać w każdej chwili ` +
      `w swoim profilu uczestnika; wycofanie nie wpływa na zgodność z prawem przetwarzania przed wycofaniem.`,
  },
  contactOnly: {
    version: "draft-2026-10-contact",
    text: (partnerName: string, eventName: string) =>
      `Wyrażam zgodę na przekazanie firmie ${partnerName}, partnerowi wydarzenia ${eventName}, ` +
      `moich danych kontaktowych (imię, nazwisko, adres e-mail, firma, stanowisko) w celu ` +
      `skontaktowania się ze mną w sprawie jej oferty. ` +
      `${partnerName} staje się odrębnym administratorem tych danych. Zgoda jest dobrowolna — ` +
      `jej brak nie wpływa na udział w wydarzeniu ani na punkty. Możesz ją wycofać w każdej chwili ` +
      `w swoim profilu uczestnika; wycofanie nie wpływa na zgodność z prawem przetwarzania przed wycofaniem.`,
  },
} as const;

/** Wariant zgody dla stoiska: z pytaniami, gdy partner ma choć jedno zaakceptowane pytanie. */
export function leadConsentFor(
  hasQuestions: boolean,
  partnerName: string,
  eventName: string,
): { version: string; text: string } {
  const variant = hasQuestions ? PARTNER_LEADS_CONSENT.withQuestions : PARTNER_LEADS_CONSENT.contactOnly;
  return { version: variant.version, text: variant.text(partnerName, eventName) };
}

/** Stan karty zgody przy stoisku (strona uczestnika). */
export type LeadCardState = {
  /** Pytania widoczne dla uczestnika — wyłącznie zaakceptowane przez organizatora. */
  questions: PublicQuestion[];
  consent: { version: string; text: string };
  /** „given” — aktywna zgoda (podziękowanie + „Wycofaj”); „form” — formularz zgody. */
  mode: "form" | "given";
  activeConsentId: string | null;
};

/**
 * Karta zgody przy włączonej fladze jest ZAWSZE widoczna: bez zaakceptowanych pytań (brak pytań
 * albo tylko oczekujące / odrzucone) — sama zgoda na kontakt „Zostaw kontakt dla {partner}”;
 * z zaakceptowanymi — pytania + zgoda. Po wycofaniu zgody (brak aktywnej) wraca formularz.
 * Flaga wyłączona → null (karty nie ma).
 */
export function leadCardState(params: {
  enabled: boolean;
  questions: (PublicQuestion & { status?: string })[];
  activeConsentId: string | null;
  partnerName: string;
  eventName: string;
}): LeadCardState | null {
  if (!params.enabled) return null;
  const questions = params.questions
    .filter((q) => q.status === undefined || q.status === "approved")
    .map(({ id, kind, prompt, options }) => ({ id, kind, prompt, options }));
  return {
    questions,
    consent: leadConsentFor(questions.length > 0, params.partnerName, params.eventName),
    mode: params.activeConsentId ? "given" : "form",
    activeConsentId: params.activeConsentId,
  };
}

/** Porównanie pytań do wykrywania duplikatów: bez wielkości liter, nadmiarowych spacji i końcowej interpunkcji. */
export function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ").replace(/[\s?!.]+$/u, "");
}

type FlagEnv = { PARTNER_LEADS_ENABLED?: string; VERCEL_ENV?: string };

/**
 * Faza B włączona: PARTNER_LEADS_ENABLED="true" ORAZ (nie produkcja ALBO treść zgody
 * zatwierdzona prawnie). Domyślnie wyłączona wszędzie.
 */
export function partnerLeadsEnabled(env: FlagEnv, legalApproved: boolean = PARTNER_LEADS_CONSENT.legalApproved): boolean {
  if (env.PARTNER_LEADS_ENABLED?.trim() !== "true") return false;
  if (env.VERCEL_ENV === "production" && !legalApproved) return false;
  return true;
}

// ── Pytania ────────────────────────────────────────────────────────────────
export const MAX_QUESTIONS_PER_PARTNER = 3;
/** Pytanie usunięte przez partnera, ale z odpowiedziami — zostaje w bazie (status rejected), ukryte w listach. */
export const PARTNER_DELETED_NOTE = "Usunięte przez partnera.";
export const QUESTION_PROMPT_MAX_LENGTH = 300;
export const QUESTION_OPTION_MAX_LENGTH = 100;
export const QUESTION_OPTIONS_MIN = 2;
export const QUESTION_OPTIONS_MAX = 6;
export const ANSWER_MAX_LENGTH = 500;

export type QuestionKind = "text" | "single_choice";
export type QuestionOption = { id: string; label: string };
export type QuestionStatus = "pending" | "approved" | "rejected";

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  text: "Krótka odpowiedź",
  single_choice: "Jednokrotny wybór",
};

export const QUESTION_STATUS: Record<QuestionStatus, { label: string; variant: "warning" | "success" | "secondary" }> = {
  pending: { label: "Czeka na akceptację", variant: "warning" },
  approved: { label: "Zaakceptowane", variant: "success" },
  rejected: { label: "Odrzucone", variant: "secondary" },
};

export type QuestionInput = { kind: QuestionKind; prompt: string; options: QuestionOption[] };

/**
 * Pytanie z formularza partnera. Opcje: jedna na linię (puste pomijane). Identyfikatory
 * opcji nadawane po kolei (a, b, c…) — odpowiedź zapisujemy jako etykietę, więc stabilność
 * id między edycjami nie jest potrzebna.
 */
export function validateQuestionInput(
  get: (key: string) => unknown,
): { ok: true; value: QuestionInput } | { ok: false; error: string } {
  const kind = get("kind");
  if (kind !== "text" && kind !== "single_choice") return { ok: false, error: "Wybierz rodzaj pytania." };
  const prompt = typeof get("prompt") === "string" ? (get("prompt") as string).trim() : "";
  if (!prompt) return { ok: false, error: "Wpisz treść pytania." };
  if (prompt.length > QUESTION_PROMPT_MAX_LENGTH) {
    return { ok: false, error: `Pytanie może mieć najwyżej ${QUESTION_PROMPT_MAX_LENGTH} znaków.` };
  }
  if (kind === "text") return { ok: true, value: { kind, prompt, options: [] } };

  const raw = typeof get("options") === "string" ? (get("options") as string) : "";
  const labels = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
    return { ok: false, error: "Odpowiedzi do wyboru nie mogą się powtarzać." };
  }
  if (labels.length < QUESTION_OPTIONS_MIN || labels.length > QUESTION_OPTIONS_MAX) {
    return { ok: false, error: `Podaj od ${QUESTION_OPTIONS_MIN} do ${QUESTION_OPTIONS_MAX} odpowiedzi do wyboru (każda w osobnej linii).` };
  }
  if (labels.some((l) => l.length > QUESTION_OPTION_MAX_LENGTH)) {
    return { ok: false, error: `Odpowiedź do wyboru może mieć najwyżej ${QUESTION_OPTION_MAX_LENGTH} znaków.` };
  }
  return {
    ok: true,
    value: { kind, prompt, options: labels.map((label, i) => ({ id: String.fromCharCode(97 + i), label })) },
  };
}

export function parseQuestionOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (o): o is QuestionOption =>
      !!o && typeof o === "object" && typeof (o as QuestionOption).id === "string" && typeof (o as QuestionOption).label === "string",
  );
}

// ── Odpowiedzi uczestnika ──────────────────────────────────────────────────
export type PublicQuestion = { id: string; kind: QuestionKind; prompt: string; options: QuestionOption[] };
export type ValidAnswer = { questionId: string; prompt: string; answer: string };

/**
 * Odpowiedzi z formularza stoiska (pola `q_<questionId>`). Wszystkie pytania są opcjonalne;
 * pustych nie zapisujemy. Wybór spoza listy opcji → błąd (manipulacja formularzem).
 */
export function validateAnswers(
  questions: PublicQuestion[],
  get: (key: string) => unknown,
): { ok: true; answers: ValidAnswer[] } | { ok: false; error: string } {
  const answers: ValidAnswer[] = [];
  for (const q of questions) {
    const raw = get(`q_${q.id}`);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    if (q.kind === "single_choice") {
      const option = q.options.find((o) => o.id === value);
      if (!option) return { ok: false, error: "Nieprawidłowa odpowiedź — odśwież stronę i spróbuj ponownie." };
      answers.push({ questionId: q.id, prompt: q.prompt, answer: option.label });
    } else {
      if (value.length > ANSWER_MAX_LENGTH) {
        return { ok: false, error: `Odpowiedź może mieć najwyżej ${ANSWER_MAX_LENGTH} znaków.` };
      }
      answers.push({ questionId: q.id, prompt: q.prompt, answer: value });
    }
  }
  return { ok: true, answers };
}

// ── Leady ──────────────────────────────────────────────────────────────────
export type PartnerLead = {
  consentId: string;
  givenAt: string;
  consentVersion: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  answers: { prompt: string; answer: string }[];
};

/** Wiersze CSV: stałe kolumny + jedna kolumna na każde (unikalne) pytanie, w kolejności wystąpienia. */
export function leadsToCsvRows(leads: PartnerLead[]): { columns: string[]; rows: Record<string, string>[] } {
  const prompts: string[] = [];
  for (const l of leads) for (const a of l.answers) if (!prompts.includes(a.prompt)) prompts.push(a.prompt);
  const base = ["imię", "nazwisko", "e-mail", "firma", "stanowisko", "zgoda_udzielona", "wersja_zgody"];
  const rows = leads.map((l) => {
    const row: Record<string, string> = {
      "imię": l.firstName ?? "",
      nazwisko: l.lastName ?? "",
      "e-mail": l.email ?? "",
      firma: l.company ?? "",
      stanowisko: l.jobTitle ?? "",
      zgoda_udzielona: l.givenAt,
      wersja_zgody: l.consentVersion,
    };
    for (const p of prompts) row[p] = l.answers.find((a) => a.prompt === p)?.answer ?? "";
    return row;
  });
  return { columns: [...base, ...prompts], rows };
}

/**
 * CSV dla polskiego Excela: BOM UTF-8 (polskie znaki) i średnik jako separator (Excel z
 * ustawieniami PL dzieli kolumny po średniku). Pola ze średnikiem, przecinkiem, cudzysłowem
 * albo nową linią są cytowane, cudzysłowy podwajane.
 */
export function toExcelCsv(fields: string[], data: string[][]): string {
  const cell = (v: string) => (/[;,"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [fields, ...data].map((r) => r.map(cell).join(";")).join("\r\n");
}

/** Komórki zaczynające się od = + - @ (i tab/CR) Excel traktuje jak formułę — neutralizujemy. */
export function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  consent_given: "Uczestnik wyraził zgodę",
  consent_withdrawn: "Uczestnik wycofał zgodę",
  leads_viewed: "Podgląd leadów",
  leads_exported: "Eksport leadów (CSV)",
  question_submitted: "Zgłoszono pytanie",
  question_deleted: "Usunięto pytanie",
  question_approved: "Zaakceptowano pytanie",
  question_rejected: "Odrzucono pytanie",
};

export const AUDIT_ACTOR_LABELS: Record<string, string> = {
  attendee: "Uczestnik",
  partner: "Partner",
  organizer: "Organizator",
};
