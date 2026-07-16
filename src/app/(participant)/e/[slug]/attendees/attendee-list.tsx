"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AttendeeListItem = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  industry: string | null;
  interests: string[] | null;
  looking_for: string | null;
  avatar_url: string | null;
  networking_visible: boolean;
};

const ALL_INDUSTRIES = "__all__";

// Poprawna polska odmiana liczebnika dla rzeczownika "uczestnik".
function pluralAttendees(n: number): string {
  if (n === 1) return "uczestnik";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "uczestnicy";
  }
  return "uczestników";
}

export function AttendeeList({
  slug,
  attendees,
  currentAttendeeId,
}: {
  slug: string;
  attendees: AttendeeListItem[];
  currentAttendeeId: string;
}) {
  const [industry, setIndustry] = useState(ALL_INDUSTRIES);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const industries = useMemo(
    () =>
      Array.from(
        new Set(
          attendees
            .map((a) => a.industry)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b, "pl")),
    [attendees],
  );

  const allInterests = useMemo(
    () =>
      Array.from(
        new Set(attendees.flatMap((a) => a.interests ?? [])),
      ).sort((a, b) => a.localeCompare(b, "pl")),
    [attendees],
  );

  const filtered = useMemo(
    () =>
      attendees.filter((a) => {
        if (industry !== ALL_INDUSTRIES && a.industry !== industry) {
          return false;
        }
        if (selectedInterests.length > 0) {
          const set = new Set(a.interests ?? []);
          if (!selectedInterests.every((interest) => set.has(interest))) {
            return false;
          }
        }
        return true;
      }),
    [attendees, industry, selectedInterests],
  );

  const hasFilters =
    industry !== ALL_INDUSTRIES || selectedInterests.length > 0;

  function toggleInterest(value: string) {
    setSelectedInterests((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  }

  function clearFilters() {
    setIndustry(ALL_INDUSTRIES);
    setSelectedInterests([]);
  }

  return (
    <div className="flex flex-col gap-4">
      {(industries.length > 0 || allInterests.length > 0) && (
        <div className="flex flex-col gap-3">
          {industries.length > 0 && (
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_INDUSTRIES}>Wszystkie branże</SelectItem>
                {industries.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {allInterests.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allInterests.map((interest) => {
                const selected = selectedInterests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-foreground",
                    )}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="w-fit"
            >
              Wyczyść filtry
            </Button>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {filtered.length} {pluralAttendees(filtered.length)}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Brak uczestników spełniających wybrane filtry.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const fullName = [a.first_name, a.last_name]
              .filter(Boolean)
              .join(" ");
            const initials = [a.first_name?.[0], a.last_name?.[0]]
              .filter(Boolean)
              .join("");
            const role = [a.job_title, a.company].filter(Boolean).join(" · ");
            const isSelf = a.id === currentAttendeeId;

            return (
              <Card
                key={a.id}
                className={cn(isSelf && "border-primary bg-primary/5")}
              >
                <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
                  {isSelf && <Badge className="mb-1">Mój profil</Badge>}
                  <Avatar className="h-16 w-16">
                    {a.avatar_url && (
                      <AvatarImage src={a.avatar_url} alt={fullName} />
                    )}
                    <AvatarFallback className="text-lg">
                      {initials || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold">
                    {fullName || "Uczestnik"}
                  </span>
                  {role && (
                    <span className="text-sm text-muted-foreground">
                      {role}
                    </span>
                  )}
                  {a.industry && (
                    <Badge variant="secondary">{a.industry}</Badge>
                  )}
                  {a.interests && a.interests.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1">
                      {a.interests.map((interest) => (
                        <span
                          key={interest}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                  {a.looking_for && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Szuka:</span>{" "}
                      {a.looking_for}
                    </p>
                  )}
                  {isSelf && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="mt-2"
                    >
                      <Link href={`/e/${slug}/profile`}>Edytuj profil</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
