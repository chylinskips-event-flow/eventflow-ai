"use client";

import { useState } from "react";

export function SpeakerBio({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <p className={expanded ? "text-sm text-muted-foreground" : "line-clamp-2 text-sm text-muted-foreground"}>
        {bio}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="self-center text-xs font-medium text-primary hover:underline"
      >
        {expanded ? "Zwiń" : "Czytaj więcej"}
      </button>
    </div>
  );
}
