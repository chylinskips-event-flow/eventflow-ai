"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { IncomingRequest } from "@/lib/contact-requests";
import { respondToContactRequest } from "./actions";

/**
 * Prośba czekająca na moją odpowiedź.
 *
 * Świadomie BEZ notatki proszącego: requester_note jest jego prywatną notatką
 * i nie opuszcza serwera — typ IncomingRequest w ogóle jej nie niesie.
 */
export function IncomingRequestCard({
  slug,
  request,
}: {
  slug: string;
  request: IncomingRequest;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { requester } = request;
  const fullName = [requester.first_name, requester.last_name]
    .filter(Boolean)
    .join(" ");
  const initials = [requester.first_name?.[0], requester.last_name?.[0]]
    .filter(Boolean)
    .join("");
  const role = [requester.job_title, requester.company].filter(Boolean).join(" · ");

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondToContactRequest(slug, request.id, accept);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się zapisać odpowiedzi.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            {requester.avatar_url && (
              <AvatarImage src={requester.avatar_url} alt={fullName} />
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
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => respond(true)}
            disabled={isPending}
          >
            Akceptuj
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => respond(false)}
            disabled={isPending}
          >
            Odrzuć
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
