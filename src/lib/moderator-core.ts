// Panel prowadzącego — czysta logika (bez I/O), testowalna jednostkowo.
// I/O: src/lib/moderator.ts.

export const MODERATOR_LINK_LABEL_MAX_LENGTH = 100;
export const ALERT_MAX_LENGTH = 500;
export const MODERATOR_NOTE_MAX_LENGTH = 10_000;

type Validated = { ok: true; value: string } | { ok: false; error: string };

export function validateLinkLabel(raw: unknown): Validated {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, error: "Podaj nazwę linku (np. imię prowadzącego)." };
  if (value.length > MODERATOR_LINK_LABEL_MAX_LENGTH) {
    return { ok: false, error: `Nazwa może mieć najwyżej ${MODERATOR_LINK_LABEL_MAX_LENGTH} znaków.` };
  }
  return { ok: true, value };
}

export function validateAlertContent(raw: unknown): Validated {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, error: "Wpisz treść komunikatu." };
  if (value.length > ALERT_MAX_LENGTH) {
    return { ok: false, error: `Komunikat może mieć najwyżej ${ALERT_MAX_LENGTH} znaków.` };
  }
  return { ok: true, value };
}

export function validateNoteContent(raw: unknown): Validated {
  const value = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trimEnd() : "";
  if (value.length > MODERATOR_NOTE_MAX_LENGTH) {
    return { ok: false, error: `Notatka może mieć najwyżej ${MODERATOR_NOTE_MAX_LENGTH} znaków.` };
  }
  return { ok: true, value };
}

/** Sala z formularza: pusta = wszystkie sale (null). */
export function normalizeRoom(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value || null;
}

/**
 * Czy sesja należy do zakresu linku. Link bez sali widzi wszystko; link z salą — tylko
 * sesje z tą salą (sesje bez sali nie są przypisane do żadnej konkretnej sali).
 */
export function sessionInLinkScope(linkRoom: string | null, sessionRoom: string | null): boolean {
  if (linkRoom === null) return true;
  return sessionRoom !== null && sessionRoom.trim() === linkRoom;
}

/** Komunikat bez sali jest dla wszystkich sal; link bez sali widzi wszystkie komunikaty. */
export function alertInLinkScope(linkRoom: string | null, alertRoom: string | null): boolean {
  return linkRoom === null || alertRoom === null || alertRoom === linkRoom;
}

/** Sale do wyboru: z ustawień eventu + z sesji (bez duplikatów, kolejność: najpierw ustawienia). */
export function collectRooms(roomNames: string[] | null, sessionRooms: (string | null)[]): string[] {
  const out: string[] = [];
  for (const r of [...(roomNames ?? []), ...sessionRooms]) {
    const v = r?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

type Timed = { id: string; starts_at: string | null; ends_at: string | null };

/**
 * Bieżąca i następna sesja. Bieżąca = trwa teraz (najpóźniej rozpoczęta, gdy kilka się
 * nakłada); następna = najbliższa przyszła. Sesje bez godziny są pomijane.
 */
export function currentAndNext<T extends Timed>(sessions: T[], now: number): { current: T | null; next: T | null } {
  let current: T | null = null;
  let next: T | null = null;
  for (const s of sessions) {
    if (!s.starts_at) continue;
    const start = new Date(s.starts_at).getTime();
    const end = s.ends_at ? new Date(s.ends_at).getTime() : start;
    if (now >= start && now <= end) {
      if (!current || start > new Date(current.starts_at as string).getTime()) current = s;
    } else if (start > now) {
      if (!next || start < new Date(next.starts_at as string).getTime()) next = s;
    }
  }
  return { current, next };
}

/** Sesja domyślnie pokazywana prowadzącemu: wybrana (jeśli w zakresie) → bieżąca → następna → pierwsza. */
export function pickFocusSession<T extends Timed>(sessions: T[], requestedId: string | null, now: number): T | null {
  if (requestedId) {
    const requested = sessions.find((s) => s.id === requestedId);
    if (requested) return requested;
  }
  const { current, next } = currentAndNext(sessions, now);
  return current ?? next ?? sessions[0] ?? null;
}

/** „za 5 min”, „za 1 h 20 min”, „teraz”. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "teraz";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `za ${m} min`;
  return m === 0 ? `za ${h} h` : `za ${h} h ${m} min`;
}

const TIER_ORDER = ["gold", "silver", "bronze", "partner"];

/** Partnerzy pogrupowani wg poziomu (Gold → Silver → Bronze → Partner → inne → bez poziomu). */
export function groupByTier<T extends { tier: string | null; name: string }>(
  partners: T[],
): { tier: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const p of partners) {
    const key = p.tier ?? null;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const rank = (t: string | null) => {
    if (t === null) return TIER_ORDER.length + 1;
    const i = TIER_ORDER.indexOf(t);
    return i === -1 ? TIER_ORDER.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || (a ?? "").localeCompare(b ?? ""))
    .map(([tier, items]) => ({ tier, items: [...items].sort((x, y) => x.name.localeCompare(y.name, "pl")) }));
}

/** Imię i nazwisko prelegenta do etykiet („→ Anna Nowak”). */
export function speakerName(s: { first_name: string | null; last_name: string | null }): string {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || "Prelegent";
}
