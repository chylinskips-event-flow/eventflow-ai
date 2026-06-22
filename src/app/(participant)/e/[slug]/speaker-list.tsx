import type { Speaker } from "@/lib/speakers";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SpeakerBio } from "./speaker-bio";

export function SpeakerList({ speakers }: { speakers: Speaker[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {speakers.map((speaker) => {
        const fullName = [speaker.first_name, speaker.last_name]
          .filter(Boolean)
          .join(" ");
        const initials = [speaker.first_name?.[0], speaker.last_name?.[0]]
          .filter(Boolean)
          .join("");

        return (
          <Card key={speaker.id}>
            <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
              <Avatar className="h-16 w-16">
                {speaker.photo_url && (
                  <AvatarImage src={speaker.photo_url} alt={fullName} />
                )}
                <AvatarFallback className="text-lg">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="font-semibold">{fullName}</span>
              {speaker.company && (
                <span className="text-sm text-muted-foreground">
                  {speaker.company}
                </span>
              )}
              {speaker.bio && <SpeakerBio bio={speaker.bio} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
