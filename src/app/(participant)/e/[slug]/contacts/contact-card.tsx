"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EstablishedContact } from "@/lib/contact-requests";
import { updateContactNote } from "./actions";

/**
 * Nawiązany kontakt: email drugiej strony (cel wymiany — ujawniany dopiero po
 * akceptacji) + moja prywatna notatka.
 *
 * Notatka zapisuje się na blur, bez przycisku Zapisz — wzorzec z toggle'a
 * networking_visible w profilu. `myNote` to zawsze kolumna należąca do mnie;
 * cudza notatka nie przychodzi z serwera.
 */
export function ContactCard({
  slug,
  contact,
}: {
  slug: string;
  contact: EstablishedContact;
}) {
  const [note, setNote] = useState(contact.myNote ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { party } = contact;
  const fullName = [party.first_name, party.last_name].filter(Boolean).join(" ");
  const initials = [party.first_name?.[0], party.last_name?.[0]]
    .filter(Boolean)
    .join("");
  const role = [party.job_title, party.company].filter(Boolean).join(" · ");

  function handleBlur() {
    if (note.trim() === (contact.myNote ?? "").trim()) {
      return; // nic się nie zmieniło — bez zbędnego round-tripu
    }
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await updateContactNote(slug, contact.id, note);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się zapisać notatki.");
        return;
      }
      setSaved("Zapisano ✓");
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            {party.avatar_url && (
              <AvatarImage src={party.avatar_url} alt={fullName} />
            )}
            <AvatarFallback>{initials || "?"}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">{fullName || "Uczestnik"}</span>
            {role && (
              <span className="text-sm text-muted-foreground">{role}</span>
            )}
          </div>
        </div>

        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Mail className="size-4 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </a>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor={`note-${contact.id}`} className="text-sm">
            Twoja notatka (widoczna tylko dla Ciebie)
          </Label>
          <Textarea
            id={`note-${contact.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleBlur}
            disabled={isPending}
            rows={2}
            maxLength={500}
            placeholder="O czym rozmawialiście?"
          />
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            saved && <p className="text-xs text-muted-foreground">{saved}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
