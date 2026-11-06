// Odczyt listy gości wklejonej z Excela albo z pliku CSV. Czysta logika, działa też w przeglądarce:
// podgląd pokazuje dokładnie to, co serwer sparsuje ponownie przy zapisie.
import { normalizeEmail } from "@/lib/access-link-core";

export const GUEST_IMPORT_MAX = 1000;
const FIELD_MAX = 200;

export type GuestRow = {
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  jobTitle: string | null;
};

export type GuestRowError = { line: number; text: string; reason: string };

export type ParsedGuestList = { guests: GuestRow[]; errors: GuestRowError[] };

type Column = "first" | "last" | "full" | "email" | "company" | "job";

const HEADERS: [RegExp, Column][] = [
  [/^(imi[eę] i nazwisko|nazwisko i imi[eę]|uczestnik|go[sś][cć]|osoba)$/i, "full"],
  [/^imi[eę]$/i, "first"],
  [/^nazwisko$/i, "last"],
  [/^(e-?mail|adres e-?mail|mail)$/i, "email"],
  [/^(firma|organizacja|company)$/i, "company"],
  [/^(stanowisko|funkcja)$/i, "job"],
];

function detectDelimiter(line: string): string {
  if (line.includes("\t")) return "\t";
  return line.includes(";") ? ";" : ",";
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim().slice(0, FIELD_MAX));
}

function headerColumns(cells: string[]): (Column | null)[] | null {
  const columns = cells.map((c) => HEADERS.find(([re]) => re.test(c))?.[1] ?? null);
  return columns.includes("email") ? columns : null;
}

function splitFullName(full: string): [string, string] {
  const [first, ...rest] = full.split(/\s+/);
  return [first ?? "", rest.join(" ")];
}

/** Wiersz bez nagłówka: układ wyznacza kolumna z adresem e-mail. */
function rowWithoutHeader(cells: string[]): Partial<Record<Column, string>> {
  const at = cells.findIndex((c) => c.includes("@"));
  if (at < 0) return {};
  const before = cells.slice(0, at).filter(Boolean);
  return {
    email: cells[at],
    ...(before.length === 1 ? { full: before[0] } : { first: before[0], last: before.slice(1).join(" ") }),
    company: cells[at + 1],
    job: cells[at + 2],
  };
}

export function parseGuestList(text: string): ParsedGuestList {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter(({ raw }) => raw.replace(/[\s;,]/g, "") !== "");
  const guests: GuestRow[] = [];
  const errors: GuestRowError[] = [];
  if (lines.length === 0) return { guests, errors };

  const delimiter = detectDelimiter(lines[0].raw);
  const columns = headerColumns(splitLine(lines[0].raw, delimiter));
  const seen = new Set<string>();

  for (const { raw, line } of columns ? lines.slice(1) : lines) {
    const cells = splitLine(raw, delimiter);
    const row: Partial<Record<Column, string>> = columns
      ? Object.fromEntries(columns.flatMap((c, i) => (c ? [[c, cells[i]]] : [])))
      : rowWithoutHeader(cells);
    const [fullFirst, fullLast] = splitFullName(row.full ?? "");
    const firstName = row.first || fullFirst;
    const lastName = row.last || fullLast;
    const email = normalizeEmail(row.email);
    const fail = (reason: string) => errors.push({ line, text: raw.slice(0, 120), reason });

    if (!email) fail("Brak poprawnego adresu e-mail");
    else if (!firstName || !lastName) fail("Brak imienia lub nazwiska");
    else if (seen.has(email)) fail("Ten adres jest już wyżej na liście");
    else if (guests.length >= GUEST_IMPORT_MAX) fail(`Limit ${GUEST_IMPORT_MAX} osób w jednym imporcie`);
    else {
      seen.add(email);
      guests.push({ firstName, lastName, email, company: row.company || null, jobTitle: row.job || null });
    }
  }
  return { guests, errors };
}

/** Plik z polskiego Excela bywa w Windows-1250, nie w UTF-8. */
export function decodeGuestFile(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250").decode(bytes);
  }
}
