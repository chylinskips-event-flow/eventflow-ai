import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, Images } from "lucide-react";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { galleryInfoText } from "@/lib/gallery";
import { listParticipantPhotos, resolveParticipantGallery } from "@/lib/gallery-participant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ParticipantGallery } from "./participant-gallery";

export const metadata: Metadata = { title: "Zdjęcia", robots: { index: false, follow: false } };

export default async function ParticipantPhotosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";

  const ctx = await resolveParticipantGallery(slug);
  if (ctx.state === "no_session") redirect(eventRoot);
  if (ctx.state === "unavailable") notFound();

  const back = (
    <Button asChild variant="outline" size="sm" className="w-fit">
      <Link href={eventRoot}>
        <ArrowLeft className="size-4" /> Powrót
      </Link>
    </Button>
  );

  if (ctx.state !== "open") {
    const comingSoon = ctx.state === "coming_soon";
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
        {back}
        <h1 className="text-2xl font-semibold">Zdjęcia – {ctx.event.name}</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            {comingSoon ? <Clock className="size-8 text-muted-foreground" /> : <Images className="size-8 text-muted-foreground" />}
            <p className="text-muted-foreground">
              {comingSoon
                ? "Galeria pojawi się wkrótce. Zajrzyj tu po wydarzeniu."
                : "Zdjęcia są dostępne dla osób, które były na wydarzeniu."}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const initial = await listParticipantPhotos(ctx.event.id, ctx.attendee.id);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4">
      {back}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Zdjęcia – {ctx.event.name}</h1>
        <p className="text-sm text-muted-foreground">{galleryInfoText(ctx.settings)}</p>
      </div>
      <ParticipantGallery slug={slug} initial={initial} />
    </main>
  );
}
