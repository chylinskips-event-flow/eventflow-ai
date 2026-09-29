"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toggleTicketType, deleteTicketType, deleteDiscountCode } from "./actions";

export function TicketTypeToggle({
  eventId,
  ticketTypeId,
  enabled,
}: {
  eventId: string;
  ticketTypeId: string;
  enabled: boolean;
}) {
  const [, startTransition] = useTransition();

  return (
    <Switch
      checked={enabled}
      onCheckedChange={(v: boolean) => {
        startTransition(() => {
          toggleTicketType(eventId, ticketTypeId, v);
        });
      }}
    />
  );
}

export function DeleteTicketTypeButton({
  eventId,
  ticketTypeId,
  name,
}: {
  eventId: string;
  ticketTypeId: string;
  name: string;
}) {
  const [, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usuń typ biletu</AlertDialogTitle>
          <AlertDialogDescription>
            Czy na pewno chcesz usunąć „{name}"? Operacja jest nieodwracalna.
            Jeśli istnieją zamówienia powiązane z tym typem, usunięcie może być
            zablokowane przez bazę danych.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Anuluj</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={() => {
              startTransition(() => {
                deleteTicketType(eventId, ticketTypeId);
              });
            }}
          >
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteDiscountCodeButton({
  eventId,
  codeId,
  code,
}: {
  eventId: string;
  codeId: string;
  code: string;
}) {
  const [, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usuń kod rabatowy</AlertDialogTitle>
          <AlertDialogDescription>
            Czy na pewno chcesz usunąć kod „{code}"?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Anuluj</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={() => {
              startTransition(() => {
                deleteDiscountCode(eventId, codeId);
              });
            }}
          >
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
