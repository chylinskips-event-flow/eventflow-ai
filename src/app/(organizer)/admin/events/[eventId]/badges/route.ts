export const runtime = "nodejs";

import { NextRequest } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getOwnEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee } from "@/lib/attendees";
import { BadgesPdf } from "./badge-pdf";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "eventro.pl";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  // Authorization: only the event's organizer.
  const event = await getOwnEvent(eventId);
  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const filter = searchParams.get("filter") ?? "approved";
  const customTitle = searchParams.get("title") ?? undefined;

  const admin = createAdminClient();
  let query = admin
    .from("attendees")
    .select("*")
    .eq("event_id", eventId);

  if (filter === "approved") {
    query = query.eq("status", "approved");
  } else if (filter === "checkedin") {
    query = (query as typeof query).not("checked_in_at", "is", null);
  }
  // filter === "all" → no additional constraint

  const { data, error } = await query
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    console.error("[badges] DB error:", error.message);
    return new Response("Database error", { status: 500 });
  }

  const attendees = (data ?? []) as Attendee[];
  if (attendees.length === 0) {
    return new Response("No attendees found for this filter", { status: 404 });
  }

  // Generate QR codes (contact exchange URL) for every attendee.
  const contactUrl = (code: string) =>
    `https://${ROOT_DOMAIN}/e/${event.slug}/connect/${code}`;

  const qrEntries = await Promise.all(
    attendees.map(async (a) => {
      const dataUrl = await QRCode.toDataURL(contactUrl(a.contact_code), {
        type: "image/png",
        width: 200,
        margin: 1,
        color: { dark: "#111111", light: "#ffffff" },
      });
      return [a.id, dataUrl] as const;
    }),
  );
  const qrDataUrls = Object.fromEntries(qrEntries);

  const pdfBuffer = await renderToBuffer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    React.createElement(BadgesPdf, { event, attendees, customTitle, qrDataUrls }) as any,
  );

  const safeSlug = event.slug.replace(/[^a-z0-9-]/g, "");
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="identyfikatory-${safeSlug}-${filter}.pdf"`,
    },
  });
}
