"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { refreshMatches } from "./actions";

// Kształt BEZ email — bezpieczny do przekazania do przeglądarki.
export type RecommendedMatch = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  industry: string | null;
  interests: string[];
  looking_for: string | null;
  avatar_url: string | null;
  reason: string;
};

export function RecommendedContacts({
  slug,
  matches,
  hasGenerated,
  minutesUntilRefresh,
}: {
  slug: string;
  matches: RecommendedMatch[];
  hasGenerated: boolean;
  minutesUntilRefresh: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      await refreshMatches(slug);
      // Bez router.refresh() wyniki nie pojawią się (Server Component nie
      // przeliczy się sam po zakończeniu akcji).
      router.refresh();
    });
  }

  // STAN 1 — nigdy nie generowano.
  if (!hasGenerated && matches.length === 0) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-6" />
          </div>
          <h2 className="text-lg font-semibold">
            Odkryj, z kim warto porozmawiać
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            AI dobierze dla Ciebie kontakty na podstawie zainteresowań i celów.
          </p>
          <Button onClick={generate} disabled={isPending}>
            {isPending ? "Szukam dopasowań…" : "Znajdź dopasowania"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canRefresh = minutesUntilRefresh <= 0;
  const refreshButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={generate}
      disabled={isPending || !canRefresh}
    >
      {isPending
        ? "Odświeżam…"
        : canRefresh
          ? "Odśwież dopasowania"
          : `Odśwież dostępne za ${minutesUntilRefresh} min`}
    </Button>
  );

  // STAN 3 — generowano, ale zero wyników.
  if (matches.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Polecane kontakty</h2>
          {refreshButton}
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nie znaleźliśmy jeszcze dopasowań – spróbuj ponownie, gdy więcej
              osób się zarejestruje.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  // STAN 2 — mamy dopasowania.
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Polecane kontakty</h2>
        {refreshButton}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((match) => {
          const fullName = [match.first_name, match.last_name]
            .filter(Boolean)
            .join(" ");
          const initials = [match.first_name?.[0], match.last_name?.[0]]
            .filter(Boolean)
            .join("");
          const role = [match.job_title, match.company]
            .filter(Boolean)
            .join(" · ");

          return (
            <Card key={match.id} className="border-primary/30">
              <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
                <Avatar className="h-16 w-16">
                  {match.avatar_url && (
                    <AvatarImage src={match.avatar_url} alt={fullName} />
                  )}
                  <AvatarFallback className="text-lg">
                    {initials || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold">{fullName || "Uczestnik"}</span>
                {role && (
                  <span className="text-sm text-muted-foreground">{role}</span>
                )}
                {match.industry && (
                  <Badge variant="secondary">{match.industry}</Badge>
                )}
                {match.interests.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1">
                    {match.interests.map((interest) => (
                      <span
                        key={interest}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                )}
                {match.looking_for && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Szuka:</span>{" "}
                    {match.looking_for}
                  </p>
                )}
                <div className="mt-1 flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2 text-left">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-sm italic text-muted-foreground">
                    {match.reason}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
