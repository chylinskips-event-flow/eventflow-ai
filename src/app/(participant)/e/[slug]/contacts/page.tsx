import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getContactSections } from "@/lib/contact-requests";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IncomingRequestCard } from "./incoming-request-card";
import { ContactCard } from "./contact-card";
import { OutgoingRequestCard } from "./outgoing-request-card";

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const attendee = await getCurrentAttendee(slug);

  if (!attendee) {
    redirect(`/e/${slug}`);
  }

  const event = await getEventBySlugForRegistration(slug);

  if (!event) {
    redirect(`/e/${slug}`);
  }

  // Jedno zapytanie na wszystkie trzy sekcje.
  const { incoming, contacts, outgoing } = await getContactSections(
    event.id,
    attendee.id,
  );

  const isEmpty =
    incoming.length === 0 && contacts.length === 0 && outgoing.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={`/e/${slug}`}>
          <ArrowLeft className="size-4" /> Powrót
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold">Kontakty – {event.name}</h1>

      {isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych kontaktów. Przejrzyj listę uczestników
              i poproś kogoś o kontakt.
            </p>
            <Button asChild>
              <Link href={`/e/${slug}/attendees`}>Przeglądaj uczestników</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Kolejność sekcji: od "wymaga mojej akcji" do archiwum. */}
          {incoming.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">
                Oczekują na Twoją odpowiedź
              </h2>
              {incoming.map((request) => (
                <IncomingRequestCard
                  key={request.id}
                  slug={slug}
                  request={request}
                />
              ))}
            </section>
          )}

          {contacts.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Twoje kontakty</h2>
              {contacts.map((contact) => (
                <ContactCard key={contact.id} slug={slug} contact={contact} />
              ))}
            </section>
          )}

          {outgoing.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Wysłane prośby</h2>
              {outgoing.map((request) => (
                <OutgoingRequestCard key={request.id} request={request} />
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
