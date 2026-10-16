// CSV dla polskiego Excela — client-safe, bez zależności.

/** Komórki zaczynające się od = + - @ (i tab/CR) Excel traktuje jak formułę — neutralizujemy. */
export function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * BOM UTF-8 (polskie znaki) i średnik jako separator (Excel z ustawieniami PL dzieli kolumny
 * po średniku). Pola ze średnikiem, przecinkiem, cudzysłowem albo nową linią są cytowane,
 * cudzysłowy podwajane. Każda komórka przechodzi przez csvSafe.
 */
export function toExcelCsv(fields: string[], data: (string | number)[][]): string {
  const cell = (raw: string | number) => {
    const v = typeof raw === "number" ? String(raw) : csvSafe(raw);
    return /[;,"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return "﻿" + [fields, ...data].map((r) => r.map(cell).join(";")).join("\r\n");
}
