import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Building2, ChevronLeft, Download, ExternalLink, Gift, Globe, MapPin } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Partner } from "@/lib/partners";
import { partnerTierLabel } from "@/lib/partner-options";
import { getPartnerMaterials } from "@/lib/partner-portal";
import { MATERIAL_TYPES, SOCIAL_KEYS, SOCIAL_LABELS, formatBytes, parseSocialLinks } from "@/lib/partner-portal-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ slug: string; partnerId: string }> };

async function loadPartner(slug: string, partnerId: string) {
  if (!UUID.test(partnerId)) return null;
  const event = await getEventBySlugForRegistration(slug);
  if (!event) return null;
  const { data } = await createAdminClient()
    .from("partners")
    .select("*")
    .eq("id", partnerId)
    .eq("event_id", event.id)
    .maybeSingle();
  return data ? { event, partner: data as Partner } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, partnerId } = await params;
  const loaded = await loadPartner(slug, partnerId);
  return loaded ? { title: `${loaded.partner.name} — ${loaded.event.name}` } : {};
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function PartnerProfilePage({ params }: Props) {
  const { slug, partnerId } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";

  const loaded = await loadPartner(slug, partnerId);
  if (!loaded) notFound();
  const { event, partner } = loaded;
  const isPublic = event.status === "published" || event.status === "live";
  if (!isPublic && !(await getCurrentAttendee(slug))) redirect(eventRoot);

  const materials = await getPartnerMaterials(partner.id, { approvedOnly: true });
  const social = parseSocialLinks(partner.social_links);
  const socialEntries = SOCIAL_KEYS.filter((k) => social[k]);
  const tier = partnerTierLabel(partner.tier);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-10">
      <Link
        href={buildEventInternalPath(slug, "/partners", origin)}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Partnerzy
      </Link>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex h-24 w-full max-w-60 items-center justify-center">
            {partner.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={partner.logo_url} alt={partner.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <Building2 className="size-12 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-bold">{partner.name}</h1>
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              {tier && <Badge variant="secondary">{tier}</Badge>}
              {partner.booth_location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" /> Stoisko {partner.booth_location}
                </span>
              )}
            </div>
          </div>
          {(partner.website_url || socialEntries.length > 0) && (
            <div className="flex flex-wrap justify-center gap-2">
              {partner.website_url && (
                <a
                  href={partner.website_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-muted"
                >
                  <Globe className="size-3.5" /> {hostOf(partner.website_url)}
                </a>
              )}
              {socialEntries.map((k) => (
                <a
                  key={k}
                  href={social[k]}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-muted"
                >
                  <ExternalLink className="size-3.5" /> {SOCIAL_LABELS[k]}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {partner.offer && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="size-5 text-primary" />
              Oferta dla uczestników
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line break-words">{partner.offer}</p>
          </CardContent>
        </Card>
      )}

      {partner.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O firmie</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed">{partner.description}</p>
          </CardContent>
        </Card>
      )}

      {materials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Materiały do pobrania</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {materials.map((m) => (
                <li key={m.id}>
                  <a
                    href={buildEventInternalPath(slug, `/partners/${partner.id}/materials/${m.id}`, origin)}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Download className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{m.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {MATERIAL_TYPES[m.mime_type] ?? "Plik"} · {formatBytes(m.size_bytes)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
