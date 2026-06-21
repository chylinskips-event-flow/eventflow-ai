import type { Speaker } from "@/lib/speakers";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
            <CardContent className="flex items-start gap-3 py-4">
              <Avatar size="lg">
                {speaker.photo_url && (
                  <AvatarImage src={speaker.photo_url} alt={fullName} />
                )}
                <AvatarFallback>{initials || "?"}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <span className="font-medium">{fullName}</span>
                {speaker.company && (
                  <span className="text-sm text-muted-foreground">
                    {speaker.company}
                  </span>
                )}
                {speaker.bio && (
                  <span className="text-sm text-muted-foreground">
                    {speaker.bio}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
