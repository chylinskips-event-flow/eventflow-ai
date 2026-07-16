"use client";

import { useState } from "react";
import type { Attendee, AttendeeStatus } from "@/lib/attendees";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AttendeeActions } from "./attendee-actions";

const STATUS_LABELS: Record<Attendee["status"], string> = {
  pending: "Oczekuje",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

const STATUS_CLASSES: Record<Attendee["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

type FilterValue = "all" | AttendeeStatus;

function attendeeName(attendee: Attendee) {
  return [attendee.first_name, attendee.last_name].filter(Boolean).join(" ") || "–";
}

export function AttendeeList({
  eventId,
  attendees,
}: {
  eventId: string;
  attendees: Attendee[];
}) {
  const hasPending = attendees.some((attendee) => attendee.status === "pending");
  const [filter, setFilter] = useState<FilterValue>(hasPending ? "pending" : "all");

  const filtered =
    filter === "all"
      ? attendees
      : attendees.filter((attendee) => attendee.status === filter);

  return (
    <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterValue)}>
      <TabsList>
        <TabsTrigger value="all">Wszyscy</TabsTrigger>
        <TabsTrigger value="pending">Oczekujący</TabsTrigger>
        <TabsTrigger value="approved">Zatwierdzeni</TabsTrigger>
        <TabsTrigger value="rejected">Odrzuceni</TabsTrigger>
      </TabsList>
      <TabsContent value={filter} className="mt-4">
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
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{attendeeName(attendee)}</span>
                    <span className="text-sm text-muted-foreground">
                      {attendee.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={cn(STATUS_CLASSES[attendee.status])}>
                      {STATUS_LABELS[attendee.status]}
                    </Badge>
                    {attendee.status === "pending" && (
                      <AttendeeActions eventId={eventId} attendeeId={attendee.id} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
