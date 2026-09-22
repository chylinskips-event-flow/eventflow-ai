import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Calendar, MapPin,
  CalendarDays, Users, Handshake, Trophy, Gift, User, CalendarCheck, ChevronRight,
} from "lucide-react";
import {
  getEventBySlugForRegistration,
  getRegistrationUnavailableReason,
  isCurrentUserEventOwner,
} from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventSessions, getEventSessionsForParticipant } from "@/lib/sessions";
import { getEventSpeakers, getEventSpeakersForParticipant } from "@/lib/speakers";
import { getAttendeeAgendaSessionIds } from "@/lib/agenda-items";
import {
  getEventContentSections,
  getEventContentSectionsForPreview,
} from "@/lib/event-content";
import { computeLevel, computeNextLevelThreshold, LEVEL_LABELS } from "@/lib/gamification";
import { formatDate, formatDateTimeRange, pluralizePl } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AgendaSessionList } from "./agenda/agenda-session-list";
import { SpeakerList } from "./speaker-list";
import { ContentSections } from "./content-sections";
import { LiveNow } from "./live-now";
import { ContactQr } from "./contact-qr";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlugForRegistration(slug);

  if (!event) return {};

  // event_content_sections has no RLS policy yet (blocked for anon) — use admin client.
  const supabase = createAdminClient();
  const { data: sections } = await supabase
    .from("event_content_sections")
    .select("body")
    .eq("event_id", event.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  let description: string;
  if (sections?.body) {
    description = sections.body.slice(0, 160);
  } else {
    const dateStr = formatDate(event.starts_at, event.timezone);
    description = dateStr ? `${event.name} · ${dateStr}` : event.name;
  }

  const ogImage = event.banner_url ?? event.logo_url ?? undefined;

  return {
    title: event.name,
    description,
    openGraph: {
      type: "website",
      title: event.name,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}


export default async function ParticipantEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string; deleted?: string }>;
}) {
  const { slug } = await params;
  const { preview, deleted } = await searchParams;

  // Jednorazowy baner po samoobsługowym usunięciu danych — sterowany wyłącznie
  // parametrem URL (?deleted=1), więc znika przy odświeżeniu bez parametru.
  const deletedBanner =
    deleted === "1" ? (
      <div className="bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white">
        Twoje dane zostały usunięte.
      </div>
    ) : null;
  const event = await getEventBySlugForRegistration(slug);

  if (!event) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Wydarzenie nie zostało znalezione</CardTitle>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // Tryb podglądu: tylko właściciel eventu i tylko z jawnym ?preview=1. Param
  // sam w sobie nic nie robi bez własności. W podglądzie ignorujemy cookie
  // uczestnika (organizator z własnym tokenem testowym zobaczyłby "Cześć,
  // [imię]!" zamiast strony marketingowej) i pomijamy bramkę "niedostępne",
  // żeby draft też był widoczny — z banerem podglądu.
  const previewMode = preview === "1" && (await isCurrentUserEventOwner(event));

  // Zatwierdzony uczestnik ma dostęp niezależnie od późniejszej zmiany statusu
  // eventu (completed/archived) - celowe. Po evencie uczestnicy mają widzieć
  // listę poznanych osób i rekomendacje kontaktów (moduł post-event/networking,
  // patrz plan produktu) - to wymaga zachowania dostępu po zakończeniu eventu,
  // nie tylko w trakcie.
  const attendee = previewMode ? null : await getCurrentAttendee(slug);

  if (attendee) {
    const fullName = [attendee.first_name, attendee.last_name]
      .filter(Boolean)
      .join(" ");
    const initials = [attendee.first_name?.[0], attendee.last_name?.[0]]
      .filter(Boolean)
      .join("");

    // Dane grywalizacji — tylko gdy włączona
    let gamificationBar: React.ReactNode = null;
    let hasRewards = false;
    if (event.gamification_enabled) {
      const adminSupabase = createAdminClient();
      const { count } = await adminSupabase
        .from("rewards")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id);
      hasRewards = (count ?? 0) > 0;

      const pts = attendee.points ?? 0;
      const level = computeLevel(pts);
      const nextThreshold = computeNextLevelThreshold(pts);
      const prevThreshold =
        level === "explorer"   ? 0   :
        level === "connector"  ? 100 :
        level === "networker"  ? 250 :
        500;
      const progressPct = nextThreshold
        ? Math.min(100, Math.round(((pts - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
        : 100;

      gamificationBar = (
        <Link href={`/e/${slug}/quests`} className="block">
          <Card className="transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-coral px-2.5 py-0.5 text-xs font-semibold text-[#171A2B]">
                    {LEVEL_LABELS[level]}
                  </span>
                  <span className="text-xl font-bold tabular-nums">{pts} pkt</span>
                </div>
                {nextThreshold && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {pts} / {nextThreshold}
                  </span>
                )}
              </div>
              <Progress value={progressPct} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {nextThreshold
                  ? `Pozostało do ${LEVEL_LABELS[computeLevel(nextThreshold)]}: ${nextThreshold - pts} pkt`
                  : "Najwyższy poziom 🏆"}
              </p>
            </CardContent>
          </Card>
        </Link>
      );
    }

    const roleInfo = [attendee.job_title, attendee.company].filter(Boolean).join(" · ");

    const businessCard = (
      <Card>
        <CardContent className="flex items-center gap-3 px-4 py-3">
          <Avatar className="size-16 shrink-0 ring-2 ring-primary/20">
            {attendee.avatar_url && (
              <AvatarImage src={attendee.avatar_url} alt={fullName} />
            )}
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{fullName || "Uczestnik"}</span>
            {roleInfo && (
              <span className="truncate text-xs text-muted-foreground">{roleInfo}</span>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <ContactQr
              slug={slug}
              contactCode={attendee.contact_code}
              size={120}
              className="rounded-lg border bg-white p-1"
            />
            <span className="text-[10px] text-muted-foreground">Kod kontaktowy</span>
          </div>
        </CardContent>
      </Card>
    );

    type NavItem = { href: string; icon: LucideIcon; label: string; bgCls: string; iconCls: string };
    type SecItem = { href: string; icon: LucideIcon; label: string };

    const primaryItems: NavItem[] = [
      { href: `/e/${slug}/agenda`,    icon: CalendarDays, label: "Agenda",     bgCls: "bg-primary/10", iconCls: "text-primary" },
      { href: `/e/${slug}/attendees`, icon: Users,        label: "Uczestnicy", bgCls: "bg-aqua/10",    iconCls: "text-aqua"    },
      { href: `/e/${slug}/contacts`,  icon: Handshake,    label: "Kontakty",   bgCls: "bg-primary/10", iconCls: "text-primary" },
    ];
    if (event.gamification_enabled) {
      primaryItems.push({ href: `/e/${slug}/quests`,    icon: Trophy,        label: "Zadania",     bgCls: "bg-coral/10",   iconCls: "text-coral"   });
    } else {
      primaryItems.push({ href: `/e/${slug}/my-agenda`, icon: CalendarCheck, label: "Moja agenda", bgCls: "bg-primary/10", iconCls: "text-primary" });
    }

    const secondaryItems: SecItem[] = [];
    if (event.gamification_enabled) {
      if (hasRewards) secondaryItems.push({ href: `/e/${slug}/rewards`,   icon: Gift,        label: "Nagrody"      });
      secondaryItems.push(              { href: `/e/${slug}/my-agenda`,   icon: CalendarCheck, label: "Moja agenda" });
    }
    secondaryItems.push({ href: `/e/${slug}/profile`, icon: User, label: "Mój profil" });

    const navGrid = (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {primaryItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[96px] flex-col items-center justify-center gap-2.5 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
            >
              <div className={`flex size-12 items-center justify-center rounded-xl ${item.bgCls}`}>
                <item.icon className={`size-6 ${item.iconCls}`} />
              </div>
              <span className="text-sm font-semibold">{item.label}</span>
            </Link>
          ))}
        </div>
        {event.gamification_enabled && (
          <Link
            href={`/e/${slug}/ranking`}
            className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 shadow-sm transition-colors hover:bg-primary/10"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <Trophy className="size-5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-primary">Ranking</span>
            <ChevronRight className="ml-auto size-4 text-primary/60" />
          </Link>
        )}
        <div className="flex flex-col gap-2">
          {secondaryItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-muted/50"
            >
              <item.icon className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{item.label}</span>
              <ChevronRight className="ml-auto size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    );

    if (event.status === "live") {
      // Prelegenci przychodzą razem z sesjami (nested select).
      const [sessions, agendaSessionIds] = await Promise.all([
        getEventSessionsForParticipant(event.id),
        getAttendeeAgendaSessionIds(attendee.id),
      ]);

      return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
          <div>
            <h1 className="text-2xl font-bold">
              Cześć, {attendee.first_name}! 👋
            </h1>
            <p className="text-muted-foreground">
              {event.gamification_enabled ? "Gotowy na networking?" : event.name}
            </p>
          </div>
          {businessCard}
          {gamificationBar}
          <LiveNow
            slug={slug}
            sessions={sessions}
            agendaSessionIds={agendaSessionIds}
            timezone={event.timezone}
          />
          {navGrid}
        </main>
      );
    }

    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
        <div>
          <h1 className="text-2xl font-bold">
            Cześć, {attendee.first_name}! 👋
          </h1>
          <p className="text-muted-foreground">
            {event.gamification_enabled ? "Gotowy na networking?" : event.name}
          </p>
        </div>
        {businessCard}
        {gamificationBar}
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              {event.status === "completed" || event.status === "archived"
                ? "Wydarzenie zakończone."
                : "Wydarzenie jeszcze się nie rozpoczęło."}
            </p>
          </CardContent>
        </Card>
        {navGrid}
      </main>
    );
  }

  const unavailableReason = previewMode
    ? null
    : getRegistrationUnavailableReason(event);

  if (unavailableReason) {
    return (
      <main className="flex min-h-screen flex-col">
        {deletedBanner}
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>{event.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{unavailableReason}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // W trybie podglądu (własność potwierdzona) czytamy przez service_role —
  // publiczne polityki RLS ujawniają te dane tylko dla published/live, więc
  // draft inaczej dałby pustą stronę bez agendy/prelegentów/sekcji.
  const [sections, sessions, speakers] = previewMode
    ? await Promise.all([
        getEventContentSectionsForPreview(event.id),
        getEventSessionsForParticipant(event.id),
        getEventSpeakersForParticipant(event.id),
      ])
    : await Promise.all([
        getEventContentSections(event.id),
        getEventSessions(event.id),
        getEventSpeakers(event.id),
      ]);

  const navLinks = [
    sections.length > 0 ? { href: "#about", label: "O wydarzeniu" } : null,
    speakers.length > 0 ? { href: "#speakers", label: "Prelegenci" } : null,
    sessions.length > 0 ? { href: "#agenda", label: "Agenda" } : null,
    { href: "#register", label: "Rejestracja" },
  ].filter((link): link is { href: string; label: string } => link !== null);

  const showPreviewBanner =
    previewMode && event.status !== "published" && event.status !== "live";

  return (
    <main className="flex flex-col">
      {deletedBanner}
      {showPreviewBanner && (
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
          Podgląd – wydarzenie nie jest jeszcze opublikowane. Widzisz je jako
          organizator; uczestnicy jeszcze go nie widzą.
        </div>
      )}
      {event.banner_url ? (
        <img
          src={event.banner_url}
          alt={event.name}
          className="w-full aspect-[2/1] lg:max-h-[480px] lg:aspect-auto 2xl:max-h-[600px] object-cover object-top"
        />
      ) : (
        <div className="flex w-full min-h-40 aspect-[2/1] lg:max-h-[480px] lg:aspect-auto lg:h-[480px] 2xl:max-h-[600px] 2xl:h-[600px] items-center justify-center bg-primary">
          <span className="px-4 text-center text-2xl font-semibold text-primary-foreground">
            {event.name}
          </span>
        </div>
      )}

      {/* Karta hero nachodząca na dolną krawędź banera — bg-background
          (nieprzezroczysta, działa z każdym banerem), z.10 nad banerem. */}
      <div className="relative z-10 mx-auto -mt-10 w-full max-w-3xl px-4 md:-mt-20">
        <div className="flex flex-col gap-4 rounded-xl border bg-background p-5 shadow-lg md:p-8">
          <Badge variant="secondary" className="w-fit">
            {event.event_type?.toUpperCase() ?? "WYDARZENIE"}
          </Badge>
          <h1 className="text-3xl font-bold md:text-4xl">{event.name}</h1>
          {(event.starts_at || event.location) && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
              {event.starts_at && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-4 shrink-0" />
                  {formatDateTimeRange(
                    event.starts_at,
                    event.ends_at,
                    event.timezone,
                  )}
                </span>
              )}
              {event.starts_at && event.location && (
                <span aria-hidden="true">·</span>
              )}
              {event.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" />
                  {event.location}
                </span>
              )}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex gap-3">
              <Button asChild size="lg" className="flex-1 sm:flex-none">
                <Link href={`/e/${slug}/register`}>Zarejestruj się →</Link>
              </Button>
              {sessions.length > 0 && (
                <Button asChild size="lg" variant="outline" className="flex-1 sm:flex-none">
                  <a href="#agenda">Zobacz agendę</a>
                </Button>
              )}
            </div>

            {/* Statystyki inline: tylko dla liczb >= 3 (małe liczby działają
                antymarketingowo — świadoma decyzja). Desktop: po prawej
                (ml-auto); mobile: pod przyciskami, wycentrowane. */}
            {(speakers.length >= 3 || sessions.length >= 3) && (
              <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 sm:ml-auto sm:justify-end">
                {speakers.length >= 3 && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-lg font-semibold">{speakers.length}</span>
                    <span className="text-sm text-muted-foreground">
                      {pluralizePl(speakers.length, [
                        "prelegent",
                        "prelegenci",
                        "prelegentów",
                      ])}
                    </span>
                  </span>
                )}
                {speakers.length >= 3 && sessions.length >= 3 && (
                  <span className="text-muted-foreground" aria-hidden="true">
                    ·
                  </span>
                )}
                {sessions.length >= 3 && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-lg font-semibold">{sessions.length}</span>
                    <span className="text-sm text-muted-foreground">
                      {pluralizePl(sessions.length, ["sesja", "sesje", "sesji"])}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {navLinks.length > 0 && (
        <nav className="mt-8 flex flex-wrap justify-center gap-4 border-b px-4 py-3 text-sm">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-semibold text-foreground/80 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}

      {sections.length > 0 && (
        <section id="about" className="mx-auto w-full max-w-4xl px-4 py-12">
          <ContentSections sections={sections} />
        </section>
      )}

      {speakers.length > 0 && (
        <section id="speakers" className="bg-muted/50">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-12">
            <h2 className="text-xl font-semibold">Prelegenci</h2>
            <SpeakerList speakers={speakers} />
          </div>
        </section>
      )}

      {sessions.length > 0 && (
        <section id="agenda" className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-12">
          <h2 className="text-xl font-semibold">Agenda</h2>
          <AgendaSessionList
            slug={slug}
            sessions={sessions}
            isLive={event.status === "live"}
            timezone={event.timezone}
            readOnly
          />
        </section>
      )}

      <div id="register" className="bg-secondary">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 p-8 text-center">
          <h2 className="text-2xl font-bold">Dołącz do nas!</h2>
          <p className="text-muted-foreground">
            Miejsca są ograniczone – zarezerwuj swoje już teraz.
          </p>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/e/${slug}/register`}>Zarejestruj się</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
