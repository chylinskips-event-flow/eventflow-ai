"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendInviteLoginLink, type InviteLoginState } from "./actions";

export function InviteLoginButton({ token }: { token: string }) {
  const [state, setState] = useState<InviteLoginState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();
  if (state.status === "sent") {
    return <p className="font-medium">Link wysłany — sprawdź skrzynkę (także spam).</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-fit"
        disabled={isPending}
        onClick={() => startTransition(async () => setState(await sendInviteLoginLink(token)))}
      >
        {isPending ? "Wysyłanie…" : "Wyślij link logowania"}
      </Button>
      {state.status === "error" && <p className="text-destructive">{state.message}</p>}
    </div>
  );
}
