"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlatformActionState } from "./actions";

const initialState: PlatformActionState = { status: "idle" };

/** Formularz akcji panelu operatora (akcja serwerowa sama weryfikuje rolę). */
export function PlatformActionForm({
  action,
  submitLabel,
  pendingLabel = "Zapisywanie…",
  variant = "default",
  confirm,
  className,
  children,
}: {
  action: (prev: PlatformActionState, formData: FormData) => Promise<PlatformActionState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "destructive";
  /** Tekst potwierdzenia (window.confirm) przed wysłaniem. */
  confirm?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn("flex flex-col gap-3", className)}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={cn(
              "text-sm",
              state.status === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
