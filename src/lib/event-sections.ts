import { createAdminClient } from "@/lib/supabase/admin";

export type SectionType =
  | "opis"
  | "faq"
  | "cta"
  | "dojazd"
  | "nocleg"
  | "galeria"
  | "highlights";

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  opis: "Opis",
  faq: "FAQ",
  cta: "Wezwanie do działania",
  dojazd: "Dojazd",
  nocleg: "Noclegi",
  galeria: "Galeria",
  highlights: "Dlaczego warto",
};

export const ALL_SECTION_TYPES: SectionType[] = [
  "opis",
  "faq",
  "cta",
  "dojazd",
  "nocleg",
  "galeria",
  "highlights",
];

export interface OpisContent {
  heading?: string;
  body: string;
}

export interface FaqItem {
  q: string;
  a: string;
}
export interface FaqContent {
  heading?: string;
  items: FaqItem[];
}

export interface CtaContent {
  heading: string;
  subtext?: string;
  button_label: string;
  button_href: string;
}

export interface DojazdContent {
  heading?: string;
  address: string;
  lat?: number;
  lng?: number;
  directions_url?: string;
}

export interface NoclegItem {
  name: string;
  url?: string;
  note?: string;
  distance?: string;
}
export interface NoclegContent {
  heading?: string;
  items: NoclegItem[];
}

export interface GaleriaImage {
  storage_path: string;
  alt?: string;
}
export interface GaleriaContent {
  heading?: string;
  images: GaleriaImage[];
}

export type HighlightIcon =
  | "star"
  | "zap"
  | "target"
  | "globe"
  | "clock"
  | "users"
  | "award"
  | "check"
  | "lightbulb"
  | "shield"
  | "heart"
  | "trophy"
  | "rocket"
  | "thumbs-up";

export const HIGHLIGHT_ICONS: HighlightIcon[] = [
  "star",
  "zap",
  "target",
  "globe",
  "clock",
  "users",
  "award",
  "check",
  "lightbulb",
  "shield",
  "heart",
  "trophy",
  "rocket",
  "thumbs-up",
];

export interface HighlightItem {
  title: string;
  text?: string;
  icon?: HighlightIcon;
}
export interface HighlightsContent {
  heading?: string;
  items: HighlightItem[];
}

export interface EventSection {
  id: string;
  event_id: string;
  type: SectionType;
  position: number;
  enabled: boolean;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---- Content validation -----------------------------------------------

function isValidActionUrl(url: string): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  if (url.startsWith("/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateSectionContent(
  type: SectionType,
  content: unknown,
): string | null {
  if (typeof content !== "object" || content === null)
    return "Treść sekcji musi być obiektem.";
  const c = content as Record<string, unknown>;

  switch (type) {
    case "opis": {
      if (typeof c.body !== "string" || !c.body.trim())
        return "Pole Tresc jest wymagane.";
      if (c.heading !== undefined && typeof c.heading !== "string")
        return "Nieprawidlowy naglowek.";
      return null;
    }
    case "faq": {
      if (!Array.isArray(c.items)) return "Lista pytań jest wymagana.";
      for (const item of c.items as unknown[]) {
        if (typeof item !== "object" || item === null) return "Nieprawidłowe pytanie.";
        const it = item as Record<string, unknown>;
        if (typeof it.q !== "string" || !it.q.trim())
          return "Każde pytanie musi mieć treść.";
        if (typeof it.a !== "string" || !it.a.trim())
          return "Każda odpowiedź musi mieć treść.";
      }
      return null;
    }
    case "cta": {
      if (typeof c.heading !== "string" || !c.heading.trim())
        return "Pole Naglowek jest wymagane.";
      if (typeof c.button_label !== "string" || !c.button_label.trim())
        return "Pole Etykieta przycisku jest wymagane.";
      if (typeof c.button_href !== "string" || !isValidActionUrl(c.button_href))
        return "Pole Adres URL przycisku musi byc poprawnym adresem (http/https lub /sciezka).";
      return null;
    }
    case "dojazd": {
      if (typeof c.address !== "string" || !c.address.trim())
        return "Pole Adres jest wymagane.";
      if (c.directions_url !== undefined && c.directions_url !== "") {
        if (!isValidActionUrl(c.directions_url as string))
          return "Link do trasy musi być poprawnym adresem (http/https).";
      }
      return null;
    }
    case "nocleg": {
      if (!Array.isArray(c.items)) return "Lista noclegów jest wymagana.";
      for (const item of c.items as unknown[]) {
        if (typeof item !== "object" || item === null) return "Nieprawidłowy element listy.";
        const it = item as Record<string, unknown>;
        if (typeof it.name !== "string" || !it.name.trim())
          return "Każdy nocleg musi mieć nazwę.";
        if (it.url && !isValidActionUrl(it.url as string))
          return "URL noclegu musi być poprawnym adresem.";
      }
      return null;
    }
    case "galeria": {
      if (!Array.isArray(c.images)) return "Lista zdjęć jest wymagana.";
      return null;
    }
    case "highlights": {
      if (!Array.isArray(c.items)) return "Lista punktów jest wymagana.";
      for (const item of c.items as unknown[]) {
        if (typeof item !== "object" || item === null) return "Nieprawidłowy element.";
        const it = item as Record<string, unknown>;
        if (typeof it.title !== "string" || !it.title.trim())
          return "Każdy punkt musi mieć tytuł.";
      }
      return null;
    }
  }
}

// ---- Default content per type ------------------------------------------

export function defaultContent(type: SectionType): Record<string, unknown> {
  switch (type) {
    case "opis":
      return { heading: "", body: "" };
    case "faq":
      return { heading: "", items: [] };
    case "cta":
      return { heading: "", subtext: "", button_label: "Zarejestruj się", button_href: "" };
    case "dojazd":
      return { heading: "", address: "", directions_url: "" };
    case "nocleg":
      return { heading: "", items: [] };
    case "galeria":
      return { heading: "", images: [] };
    case "highlights":
      return { heading: "", items: [] };
  }
}

// ---- Data access (service_role only) -----------------------------------

export async function getEventSections(eventId: string): Promise<EventSection[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("event_sections")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true });
  return (data ?? []) as EventSection[];
}

export async function getEnabledEventSections(
  eventId: string,
): Promise<EventSection[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("event_sections")
    .select("*")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .order("position", { ascending: true });
  return (data ?? []) as EventSection[];
}
