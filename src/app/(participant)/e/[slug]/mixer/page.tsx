import { redirect } from "next/navigation";
import { Network, Coffee, Users } from "lucide-react";
import { getMixerForAttendee } from "@/lib/mixer/participant";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHero, SectionHeroMedia } from "@/components/participant/section-hero";

export default async function ParticipantMixerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mixer = await getMixerForAttendee(slug);

  if (!mixer) redirect(`/e/${slug}`);

  const { mixerName, roundMinutes, breakMinutes, breakAfterRound, rounds } = mixer;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Mój"
        headlineAccent="mixer"
        subtitle={mixerName}
        media={<SectionHeroMedia icon={Network} />}
        backHref={`/e/${slug}`}
      />

      <div className="flex flex-col gap-3">
        {rounds.map((round) => (
          <>
            <Card key={round.roundNumber}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Runda {round.roundNumber}
                    </p>
                    <p className="mt-0.5 text-base font-semibold">
                      Stół {round.tableNumber}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {roundMinutes} min
                  </Badge>
                </div>

                {round.question && (
                  <div className="mb-3 rounded-lg bg-primary/5 px-3 py-2.5 text-sm text-foreground ring-1 ring-primary/10">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Pytanie lodołamacze
                    </p>
                    {round.question}
                  </div>
                )}

                {round.tablemates.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" />
                      Przy stole
                    </div>
                    <ul className="flex flex-col gap-1">
                      {round.tablemates.map((tm) => (
                        <li
                          key={tm.display_name}
                          className="flex items-baseline gap-1.5 text-sm"
                        >
                          <span className="font-medium">{tm.display_name}</span>
                          {tm.company && (
                            <span className="text-xs text-muted-foreground">
                              {tm.company}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {round.isBreakAfter && (
              <div
                key={`break-${round.roundNumber}`}
                className="flex items-center gap-3 px-1"
              >
                <div className="h-px flex-1 bg-border" />
                <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Coffee className="size-3.5" />
                  Przerwa · {breakMinutes} min
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
          </>
        ))}
      </div>
    </main>
  );
}
