"use client";

import { useActionState } from "react";
import { seedQuests, type QuestFormState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: QuestFormState = { status: "idle" };

export function SeedQuestsButton({ eventId }: { eventId: string }) {
  const [state, formAction, isPending] = useActionState(
    seedQuests.bind(null, eventId),
    initialState,
  );

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "Dodawanie..." : "Dodaj przykładowe questy"}
      </Button>
      {state.status === "error" && (
        <p className="mt-2 text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}
