"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { decodeGuestFile, parseGuestList } from "@/lib/guest-import-core";
import { importGuestList } from "../guest-actions";

const PREVIEW_ROWS = 5;

export function GuestImportForm({ eventId }: { eventId: string }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { guests, errors } = useMemo(() => parseGuestList(text), [text]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(decodeGuestFile(await file.arrayBuffer()));
    e.target.value = "";
  }

  function handleImport() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await importGuestList(eventId, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      setMessage(
        `Dodano: ${result.added}.` + (result.skipped ? ` Pominięto już zapisanych: ${result.skipped}.` : ""),
      );
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="font-medium">Dodaj gości</p>
          <p className="text-sm text-muted-foreground">
            Wklej kolumny z Excela albo wybierz plik CSV. Kolejność bez nagłówka: imię, nazwisko, e-mail,
            firma, stanowisko.
          </p>
        </div>
        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Imię\tNazwisko\tE-mail\tFirma\nJan\tNowak\tjan@firma.pl\tFirma"}
          aria-label="Lista gości"
        />
        <input type="file" accept=".csv,.txt" onChange={handleFile} aria-label="Plik CSV" className="text-sm" />

        {guests.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Poprawne wiersze: {guests.length}</p>
            <ul className="mt-1 text-muted-foreground">
              {guests.slice(0, PREVIEW_ROWS).map((g) => (
                <li key={g.email} className="truncate">
                  {g.firstName} {g.lastName}, {g.email}
                  {g.company ? `, ${g.company}` : ""}
                </li>
              ))}
              {guests.length > PREVIEW_ROWS && <li>i {guests.length - PREVIEW_ROWS} więcej</li>}
            </ul>
          </div>
        )}
        {errors.length > 0 && (
          <div className="text-sm text-destructive">
            <p className="font-medium">Do poprawy, te wiersze nie zostaną dodane: {errors.length}</p>
            <ul className="mt-1">
              {errors.slice(0, 20).map((e) => (
                <li key={e.line} className="truncate">
                  Wiersz {e.line}: {e.reason} ({e.text})
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button onClick={handleImport} disabled={pending || guests.length === 0} className="w-fit">
          {pending ? "Dodawanie…" : `Dodaj gości (${guests.length})`}
        </Button>
        {message && <p className="text-sm text-green-600">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
