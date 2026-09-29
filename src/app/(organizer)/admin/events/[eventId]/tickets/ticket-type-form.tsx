"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createTicketType, updateTicketType, type TicketTypeFormState } from "./actions";
import type { TicketType } from "@/lib/tickets";
import { Plus, Pencil } from "lucide-react";
import { useState } from "react";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function priceToPln(grosze: number): string {
  if (grosze === 0) return "0";
  return (grosze / 100).toFixed(2);
}

// ---- Create form -----------------------------------------------------------

function CreateForm({ eventId }: { eventId: string }) {
  const bound = createTicketType.bind(null, eventId);
  const [state, formAction] = useActionState<TicketTypeFormState, FormData>(bound, { status: "idle" });

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ct-name">Nazwa *</Label>
        <Input id="ct-name" name="name" required maxLength={120} placeholder="np. Bilet normalny" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ct-desc">Opis</Label>
        <Textarea id="ct-desc" name="description" rows={2} maxLength={500} placeholder="Opcjonalny opis widoczny dla kupujących" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ct-price">Cena (PLN)</Label>
          <Input
            id="ct-price"
            name="price_pln"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            defaultValue="0"
          />
          <p className="text-xs text-muted-foreground">0 = bilet darmowy</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ct-qty">Limit (pula)</Label>
          <Input
            id="ct-qty"
            name="quantity_total"
            type="number"
            min="1"
            step="1"
            placeholder="bez limitu"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ct-start">Sprzedaż od</Label>
          <Input id="ct-start" name="sales_start" type="datetime-local" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ct-end">Sprzedaż do</Label>
          <Input id="ct-end" name="sales_end" type="datetime-local" />
        </div>
      </div>

      {state.message && (
        <p className={`text-sm ${state.status === "error" ? "text-destructive" : "text-green-600"}`}>
          {state.message}
        </p>
      )}

      <Button type="submit" className="w-full">
        Dodaj typ biletu
      </Button>
    </form>
  );
}

// ---- Edit form -------------------------------------------------------------

function EditForm({
  eventId,
  ticket,
  onDone,
}: {
  eventId: string;
  ticket: TicketType;
  onDone: () => void;
}) {
  const bound = updateTicketType.bind(null, eventId, ticket.id);
  const [state, formAction] = useActionState<TicketTypeFormState, FormData>(bound, { status: "idle" });
  const [, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(fd);
    });
  }

  if (state.status === "success") {
    onDone();
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="et-name">Nazwa *</Label>
        <Input
          id="et-name"
          name="name"
          required
          maxLength={120}
          defaultValue={ticket.name}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="et-desc">Opis</Label>
        <Textarea
          id="et-desc"
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={ticket.description ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="et-price">Cena (PLN)</Label>
          <Input
            id="et-price"
            name="price_pln"
            type="number"
            min="0"
            step="0.01"
            defaultValue={priceToPln(ticket.price)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="et-qty">Limit (pula)</Label>
          <Input
            id="et-qty"
            name="quantity_total"
            type="number"
            min="1"
            step="1"
            defaultValue={ticket.quantity_total ?? ""}
            placeholder="bez limitu"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="et-start">Sprzedaż od</Label>
          <Input
            id="et-start"
            name="sales_start"
            type="datetime-local"
            defaultValue={toDatetimeLocal(ticket.sales_start)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="et-end">Sprzedaż do</Label>
          <Input
            id="et-end"
            name="sales_end"
            type="datetime-local"
            defaultValue={toDatetimeLocal(ticket.sales_end)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="et-enabled"
          name="enabled"
          defaultChecked={ticket.enabled}
        />
        <Label htmlFor="et-enabled">Aktywny</Label>
      </div>

      {state.message && (
        <p className={`text-sm ${state.status === "error" ? "text-destructive" : "text-green-600"}`}>
          {state.message}
        </p>
      )}

      <Button type="submit" className="w-full">
        Zapisz zmiany
      </Button>
    </form>
  );
}

// ---- Public components -----------------------------------------------------

export function CreateTicketTypeButton({ eventId }: { eventId: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Dodaj typ biletu
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowy typ biletu</DialogTitle>
        </DialogHeader>
        <CreateForm eventId={eventId} />
      </DialogContent>
    </Dialog>
  );
}

export function EditTicketTypeButton({
  eventId,
  ticket,
}: {
  eventId: string;
  ticket: TicketType;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edytuj: {ticket.name}</DialogTitle>
        </DialogHeader>
        <EditForm eventId={eventId} ticket={ticket} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
