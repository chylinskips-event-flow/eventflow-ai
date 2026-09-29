import { notFound, redirect } from "next/navigation";
import { getEventBySlugForRegistration, getRegistrationUnavailableReason } from "@/lib/events";
import { getPublicTicketTypes } from "@/lib/tickets";
import { Calendar } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckoutForm } from "./checkout-form";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { slug } = await params;
  const { ticket: ticketTypeId } = await searchParams;

  if (!ticketTypeId) redirect(`/e/${slug}`);

  const event = await getEventBySlugForRegistration(slug);
  if (!event) notFound();

  const unavailableReason = getRegistrationUnavailableReason(event);
  if (unavailableReason) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{event.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{unavailableReason}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const ticketTypes = await getPublicTicketTypes(event.id);
  const ticket = ticketTypes.find((t) => t.id === ticketTypeId);

  if (!ticket) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Bilet niedostępny</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Wybrany typ biletu nie jest już dostępny.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (ticket.price !== 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Płatności P24 — wkrótce</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Zakup biletów płatnych będzie dostępny po uruchomieniu integracji
              z Przelewy24.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="flex w-full max-w-2xl flex-col gap-2">
        <Badge variant="secondary" className="w-fit">
          REJESTRACJA — BILET BEZPŁATNY
        </Badge>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        {event.starts_at && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="size-4 shrink-0" />
            {formatDate(event.starts_at, event.timezone)}
          </p>
        )}
      </div>
      <CheckoutForm eventId={event.id} slug={slug} ticket={ticket} />
    </main>
  );
}
