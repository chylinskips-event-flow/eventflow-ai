import Link from "next/link";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getPartnerByTokenAndEventSlug } from "@/lib/partners";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BoothClient, type BoothQuestForClient } from "./booth-client";

const COOLDOWN_MS = 10 * 60 * 1000;

function Notice({ slug, message }: { slug: string; message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-muted-foreground">{message}</p>
          <Button asChild>
            <Link href={`/e/${slug}`}>Wróć do wydarzenia</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function BoothPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;

  const event = await getEventBySlugForRegistration(slug);
  if (!event) {
    return <Notice slug={slug} message="Nie znaleziono wydarzenia." />;
  }

  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return (
      <Notice
        slug={slug}
        message="Aby zarejestrować odwiedziny, wejdź najpierw przez swój link wejściowy."
      />
    );
  }

  const partner = await getPartnerByTokenAndEventSlug(token, slug);
  if (!partner) {
    return <Notice slug={slug} message="Nie znaleziono stoiska." />;
  }

  // Gdy gamification wyłączona — brak questa, BoothClient obsługuje prosty check-in
  if (!event.gamification_enabled) {
    return (
      <BoothClient
        slug={slug}
        partnerToken={token}
        partner={partner}
        quest={null}
        initialAttemptsUsed={0}
      />
    );
  }

  const supabase = createAdminClient();

  // Pobierz questa (pełny config — correct_id / password nie wychodzą do klienta)
  const { data: questRaw } = await supabase
    .from("quests")
    .select("id, type, title, points_value, config")
    .eq("partner_id", partner.id)
    .eq("event_id", event.id)
    .eq("is_active", true)
    .maybeSingle();

  // Sprawdź, czy quest jest już zaliczony
  const questId = questRaw?.id as string | undefined;
  let alreadyCompleted = false;
  let attemptsUsed = 0;
  let completedPoints: number | null = null;
  let completedLevel: string | null = null;

  if (questId) {
    const { data: completion } = await supabase
      .from("quest_completions")
      .select("points_awarded")
      .eq("quest_id", questId)
      .eq("attendee_id", attendee.id)
      .maybeSingle();

    if (completion) {
      alreadyCompleted = true;
      completedPoints = (completion as { points_awarded: number | null }).points_awarded;
      completedLevel = attendee.level;
    } else {
      const { data: attemptsRow } = await supabase
        .from("quiz_attempts")
        .select("attempts, last_attempt_at")
        .eq("quest_id", questId)
        .eq("attendee_id", attendee.id)
        .maybeSingle();

      attemptsUsed = (attemptsRow as { attempts: number } | null)?.attempts ?? 0;

      // Cooldown sprawdzony server-side — jeśli aktywny, BoothClient pokazuje błąd po submit
      // (action też to sprawdza). Nie przekazujemy cooldown state do klienta osobno;
      // klient może próbować submit i dostanie error z akcji z minutami.
    }
  }

  // Ekran "już zaliczone" — renderowany bez klienta
  if (alreadyCompleted) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl dark:bg-green-900/40">
              ✓
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xl font-semibold">Stoisko już odwiedzone</p>
              {completedPoints !== null && completedPoints > 0 && (
                <p className="text-3xl font-bold text-primary">
                  +{completedPoints} pkt
                </p>
              )}
              {completedLevel && (
                <p className="text-sm text-muted-foreground">
                  Twój poziom: {completedLevel}
                </p>
              )}
            </div>
            <Button asChild variant="outline">
              <Link href={`/e/${slug}`}>Wróć do wydarzenia</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Zbuduj typ questa dla klienta — correct_id i password są wycinane tutaj
  let questForClient: BoothQuestForClient = null;
  if (questRaw) {
    const type = questRaw.type as string;
    const base = {
      id: questRaw.id as string,
      type: type as BoothQuestForClient extends null ? never : NonNullable<BoothQuestForClient>["type"],
      title: questRaw.title as string,
      points_value: (questRaw.points_value as number) ?? 0,
    };

    if (type === "booth_quiz") {
      const config = questRaw.config as {
        question: string;
        options: { id: string; label: string }[];
        correct_id: string; // stays server-side — never passed to client
      } | null;
      questForClient = {
        ...base,
        type: "booth_quiz",
        question: config?.question ?? "",
        options: config?.options ?? [],
      };
    } else if (type === "booth_password") {
      questForClient = { ...base, type: "booth_password" };
    } else {
      questForClient = { ...base, type: "booth_visit" };
    }
  }

  return (
    <BoothClient
      slug={slug}
      partnerToken={token}
      partner={partner}
      quest={questForClient}
      initialAttemptsUsed={attemptsUsed}
    />
  );
}
