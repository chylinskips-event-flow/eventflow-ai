import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; partnerId: string }> },
) {
  const { eventId, partnerId } = await params;

  // 1. Weryfikacja własności eventu przez session client
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: event } = await sessionClient
    .from("events")
    .select("id, organization_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Sprawdź własność organizacji
  const { data: org } = await sessionClient
    .from("organizations")
    .select("id")
    .eq("id", (event as { id: string; organization_id: string }).organization_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Weryfikacja że partner należy do tego eventu (zapobiega podmiance partnerId w URL)
  const admin = createAdminClient();
  const { data: partner } = await admin
    .from("partners")
    .select("id, name, event_id")
    .eq("id", partnerId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  // 3. Pobierz leady — tylko uczestnicy z lead_consent_given=true
  const { data: rows } = await admin
    .from("checkins")
    .select(
      "lead_consent_given, attendees(first_name, last_name, email, company, job_title), lead_consents(consented_at, consent_text_version)",
    )
    .eq("partner_id", partnerId)
    .eq("lead_consent_given", true);

  type LeadRow = {
    lead_consent_given: boolean;
    attendees: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      company: string | null;
      job_title: string | null;
    } | null;
    lead_consents: {
      consented_at: string;
      consent_text_version: string | null;
    }[] | null;
  };

  const csvData = (rows ?? []).map((r) => {
    const row = r as unknown as LeadRow;
    const a = row.attendees;
    // Bierzemy pierwszy wpis lead_consents (jeden checkin = jedna zgoda)
    const consent = Array.isArray(row.lead_consents)
      ? row.lead_consents[0]
      : row.lead_consents ?? null;

    return {
      first_name: a?.first_name ?? "",
      last_name: a?.last_name ?? "",
      email: a?.email ?? "",
      company: a?.company ?? "",
      job_title: a?.job_title ?? "",
      consented_at: consent?.consented_at ?? "",
      consent_text_version: consent?.consent_text_version ?? "",
    };
  });

  const csv = Papa.unparse(csvData, {
    columns: [
      "first_name",
      "last_name",
      "email",
      "company",
      "job_title",
      "consented_at",
      "consent_text_version",
    ],
  });

  const partnerName = (partner as { id: string; name: string; event_id: string }).name;
  const safeName = partnerName.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();

  // UTF-8 BOM żeby Excel nie krzaczył polskich znaków
  const bom = "﻿";

  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${safeName}.csv"`,
    },
  });
}
