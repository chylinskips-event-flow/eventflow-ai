"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BadgeFilter = "approved" | "all" | "checkedin";

const FILTER_LABELS: Record<BadgeFilter, string> = {
  approved: "Zatwierdzeni",
  all: "Wszyscy",
  checkedin: "Obecni (check-in)",
};

export function BadgesButton({ eventId }: { eventId: string }) {
  const [filter, setFilter] = useState<BadgeFilter>("approved");
  const [isLoading, setIsLoading] = useState(false);

  function handleDownload() {
    setIsLoading(true);
    const url = `/admin/events/${eventId}/badges?filter=${filter}`;
    // Opens the PDF download. Browser handles Content-Disposition: attachment.
    const a = document.createElement("a");
    a.href = url;
    a.click();
    // Reset after a short delay so the button feedback is visible.
    setTimeout(() => setIsLoading(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={filter}
        onValueChange={(v) => setFilter(v as BadgeFilter)}
      >
        <SelectTrigger className="w-44 h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(FILTER_LABELS) as [BadgeFilter, string][]).map(
            ([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isLoading}
      >
        <Download className="mr-1.5 size-4" />
        {isLoading ? "Generowanie..." : "Identyfikatory PDF"}
      </Button>
    </div>
  );
}
