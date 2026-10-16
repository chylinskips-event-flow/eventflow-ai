"use client";

import { useState } from "react";
import type { Attendee } from "@/lib/attendees";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabBar, panelDomId, tabDomId, type TabBarItem } from "@/components/tab-bar";
import { ATTENDEE_TAB_STATUS, type AttendeeTabKey } from "@/lib/organizer-tabs";
import { urlForTab } from "@/lib/url-tabs";
import { AttendeeActions } from "./attendee-actions";
import { DeleteAttendeeButton } from "./delete-attendee-button";
import { EditAttendeeButton } from "./edit-attendee-button";

const STATUS_LABELS: Record<Attendee["status"], string> = {
  pending: "Oczekuje",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

const STATUS_VARIANTS: Record<Attendee["status"], "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

function attendeeName(attendee: Attendee) {
  return [attendee.first_name, attendee.last_name].filter(Boolean).join(" ") || "–";
}

/**
 * Lista uczestników z filtrem statusu na wspólnym pasku zakładek (jak reszta panelu organizatora).
 * Zakładka w adresie (?tab=), domyślna bez parametru.
 */
export function AttendeeList({
  eventId,
  attendees,
  tabs,
  initialTab,
  defaultTab,
}: {
  eventId: string;
  attendees: Attendee[];
  tabs: TabBarItem<AttendeeTabKey>[];
  initialTab: AttendeeTabKey;
  defaultTab: AttendeeTabKey;
}) {
  const [active, setActive] = useState<AttendeeTabKey>(initialTab);
  const status = ATTENDEE_TAB_STATUS[active];
  const filtered = status ? attendees.filter((attendee) => attendee.status === status) : attendees;

  function select(key: AttendeeTabKey) {
    setActive(key);
    window.history.replaceState(window.history.state, "", urlForTab(window.location.href, key, defaultTab));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TabBar tabs={tabs} active={active} onSelect={select} idPrefix="attendees" ariaLabel="Status uczestników" />
      <div role="tabpanel" id={panelDomId("attendees", active)} aria-labelledby={tabDomId("attendees", active)}>
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-muted-foreground">
                Brak uczestników w tej kategorii.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((attendee) => (
              <Card key={attendee.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{attendeeName(attendee)}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {attendee.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[attendee.status]}>
                      {STATUS_LABELS[attendee.status]}
                    </Badge>
                    {attendee.status === "pending" && (
                      <AttendeeActions eventId={eventId} attendeeId={attendee.id} />
                    )}
                    <EditAttendeeButton eventId={eventId} attendee={attendee} />
                    <DeleteAttendeeButton
                      eventId={eventId}
                      attendeeId={attendee.id}
                      attendeeName={attendeeName(attendee)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
