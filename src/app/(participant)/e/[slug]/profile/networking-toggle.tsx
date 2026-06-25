"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { updateNetworkingVisibility } from "./actions";

export function NetworkingToggle({
  slug,
  initialVisible,
}: {
  slug: string;
  initialVisible: boolean;
}) {
  const [visible, setVisible] = useState(initialVisible);
  const [isPending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    // Optymistycznie aktualizujemy UI od razu, zapis idzie w tle.
    setVisible(checked);
    startTransition(async () => {
      await updateNetworkingVisibility(slug, checked);
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="networking_visible"
        checked={visible}
        onCheckedChange={(checked) => handleChange(checked === true)}
        disabled={isPending}
        className="mt-1"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="networking_visible" className="font-normal">
          Pokaż mój profil innym uczestnikom
        </Label>
        <p className="text-sm text-muted-foreground">
          Gdy wyłączone, Twoje dane nie będą widoczne dla innych uczestników na
          liście networkingowej.
        </p>
        {isPending && (
          <p className="text-xs text-muted-foreground">Zapisywanie…</p>
        )}
      </div>
    </div>
  );
}
