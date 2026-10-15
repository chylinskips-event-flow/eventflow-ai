"use client";

import { useState, useTransition } from "react";
import type { AttendeeConsent } from "@/lib/partner-leads";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { withdrawPartnerConsent } from "../partner-lead-actions";

/** Zgody na przekazanie danych partnerom (#10 Faza B) — wycofanie tak samo łatwe jak wyrażenie. */
export function PartnerConsents({
  slug,
  consents,
  timezone,
}: {
  slug: string;
  consents: AttendeeConsent[];
  timezone: string | null;
}) {
  const [withdrawn, setWithdrawn] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = consents.filter((c) => !withdrawn.includes(c.id));
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">Nie masz aktywnych zgód — partnerzy nie otrzymują Twoich danych.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {visible.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{c.partnerName}</p>
              <p className="text-xs text-muted-foreground">Zgoda od {formatDateTime(c.givenAt, timezone)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pendingId !== null}
              onClick={() => {
                setPendingId(c.id);
                startTransition(async () => {
                  const res = await withdrawPartnerConsent(slug, c.id);
                  if (res.ok) {
                    setWithdrawn((w) => [...w, c.id]);
                    setError(null);
                  } else setError(res.message ?? "Nie udało się wycofać zgody.");
                  setPendingId(null);
                });
              }}
            >
              {pendingId === c.id ? "Wycofywanie…" : "Wycofaj zgodę"}
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
