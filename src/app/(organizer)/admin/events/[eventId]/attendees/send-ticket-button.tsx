"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendOneTicket } from "./guest-actions";

export function SendTicketButton({
  eventId,
  attendeeId,
  sentAt,
}: {
  eventId: string;
  attendeeId: string;
  sentAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const label = sentAt ? "Wyślij bilet ponownie" : "Wyślij bilet";

  function handleSend() {
    setNote(null);
    startTransition(async () => {
      const result = await sendOneTicket(eventId, attendeeId);
      setNote(result.ok ? "Wysłano" : result.error);
    });
  }

  return (
    <>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSend}
        disabled={pending}
        aria-label={label}
        title={label}
        className={sentAt ? "text-green-600" : "text-muted-foreground"}
      >
        <Send className="size-4" />
      </Button>
    </>
  );
}
