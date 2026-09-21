import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import QRCode from "qrcode";
import { getOwnEvent } from "@/lib/events";
import { getPartnerById } from "@/lib/partners";
import { partnerTierLabel } from "@/lib/partner-options";
import { getOrigin } from "@/lib/request-origin";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./print-button";

export default async function BoothQrPage({
  params,
}: {
  params: Promise<{ eventId: string; partnerId: string }>;
}) {
  const { eventId, partnerId } = await params;

  const event = await getOwnEvent(eventId);
  if (!event) {
    notFound();
  }

  const partner = await getPartnerById(eventId, partnerId);
  if (!partner) {
    notFound();
  }

  // QR prowadzi do trasy stoiska uczestnika (moduł grywalizacji). Trasa
  // /e/[slug]/booth/[token] powstaje osobno — kod działa, gdy tylko się pojawi.
  const origin = getOrigin(await headers());
  const boothUrl = `${origin}/e/${event.slug}/booth/${partner.qr_code_token}`;
  const qrDataUrl = await QRCode.toDataURL(boothUrl, { width: 600, margin: 2 });

  const tierLabel = partnerTierLabel(partner.tier);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 p-8">
      {/* Pasek narzędzi — ukryty na wydruku */}
      <div className="flex w-full items-center justify-between print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/events/${eventId}/partners`}>
            <ArrowLeft className="size-4" /> Powrót
          </Link>
        </Button>
        <PrintButton />
      </div>

      {/* Karta do druku (A4) */}
      <div className="flex w-full flex-col items-center gap-6 rounded-xl border p-10 text-center print:border-0">
        {tierLabel && (
          <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Partner {tierLabel}
          </span>
        )}
        <h1 className="text-4xl font-bold">{partner.name}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL QR */}
        <img
          src={qrDataUrl}
          alt={`Kod QR stoiska – ${partner.name}`}
          width={320}
          height={320}
          className="rounded-lg border"
        />
        <p className="text-2xl font-semibold">Zeskanuj i wykonaj zadanie</p>
        {partner.booth_location && (
          <p className="text-lg text-muted-foreground">
            {partner.booth_location}
          </p>
        )}
      </div>
    </div>
  );
}
