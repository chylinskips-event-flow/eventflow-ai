"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createDiscountCode, type DiscountCodeFormState } from "./actions";
import { Plus } from "lucide-react";

export function CreateDiscountCodeButton({ eventId }: { eventId: string }) {
  const bound = createDiscountCode.bind(null, eventId);
  const [state, formAction] = useActionState<DiscountCodeFormState, FormData>(bound, {
    status: "idle",
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 size-4" />
          Dodaj kod
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowy kod rabatowy</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dc-code">Kod *</Label>
            <Input
              id="dc-code"
              name="code"
              required
              maxLength={50}
              placeholder="np. EARLYBIRD2026"
              className="uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Automatycznie zmieniony na wielkie litery.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dc-kind">Typ rabatu *</Label>
              <Select name="kind" defaultValue="percent">
                <SelectTrigger id="dc-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Procentowy (%)</SelectItem>
                  <SelectItem value="amount">Kwotowy (PLN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dc-value">Wartość *</Label>
              <Input
                id="dc-value"
                name="value"
                type="number"
                min="1"
                step="1"
                required
                placeholder="np. 20"
              />
              <p className="text-xs text-muted-foreground">% lub grosze (PLN×100)</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dc-maxuses">Limit użyć</Label>
            <Input
              id="dc-maxuses"
              name="max_uses"
              type="number"
              min="1"
              step="1"
              placeholder="bez limitu"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dc-from">Ważny od</Label>
              <Input id="dc-from" name="valid_from" type="datetime-local" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dc-until">Ważny do</Label>
              <Input id="dc-until" name="valid_until" type="datetime-local" />
            </div>
          </div>

          {state.message && (
            <p
              className={`text-sm ${
                state.status === "error" ? "text-destructive" : "text-green-600"
              }`}
            >
              {state.message}
            </p>
          )}

          <Button type="submit" className="w-full">
            Dodaj kod
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
