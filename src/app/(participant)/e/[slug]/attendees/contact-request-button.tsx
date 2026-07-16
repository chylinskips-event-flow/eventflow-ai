"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ContactCardState } from "@/lib/contact-requests";
import { sendContactRequest } from "../contacts/actions";

/**
 * Przycisk kontaktu na karcie uczestnika.
 *
 * Stan przychodzi propsem policzonym server-side (jedna mapa na całą siatkę —
 * zero zapytań per karta) i po router.refresh() przemalowuje się sam, więc nie
 * trzymamy lokalnej kopii statusu.
 */
export function ContactRequestButton({
  slug,
  recipientId,
  state,
}: {
  slug: string;
  recipientId: string;
  state: ContactCardState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (state.kind === "accepted") {
    return (
      <Button asChild size="sm" variant="secondary" className="w-full">
        <Link href={`/e/${slug}/contacts`}>Kontakt nawiązany</Link>
      </Button>
    );
  }

  if (state.kind === "incoming_pending") {
    return (
      <Button asChild size="sm" className="w-full">
        <Link href={`/e/${slug}/contacts`}>Odpowiedz</Link>
      </Button>
    );
  }

  // "Wysłano" obejmuje też odmowę mojej prośby — requester nie widzi odmowy,
  // a wyłączony przycisk blokuje ponawianie.
  if (state.kind === "outgoing_pending") {
    return (
      <Button size="sm" variant="outline" className="w-full" disabled>
        Wysłano
      </Button>
    );
  }

  // Prośba, którą sam odrzuciłem — brak akcji, świadomie bez przycisku.
  if (state.kind === "declined") {
    return null;
  }

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await sendContactRequest(slug, recipientId);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się wysłać prośby.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <Button
        size="sm"
        className="w-full"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Wysyłanie..." : "Poproś o kontakt"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
