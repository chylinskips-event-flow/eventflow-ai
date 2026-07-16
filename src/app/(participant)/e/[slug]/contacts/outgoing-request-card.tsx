import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { OutgoingRequest } from "@/lib/contact-requests";

/**
 * Wysłana prośba — server component, bez akcji.
 *
 * Nie renderuje statusu: pending i declined wyglądają identycznie, bo requester
 * nie dowiaduje się o odmowie (typ OutgoingRequest nawet nie niesie statusu).
 */
export function OutgoingRequestCard({ request }: { request: OutgoingRequest }) {
  const { recipient } = request;
  const fullName = [recipient.first_name, recipient.last_name]
    .filter(Boolean)
    .join(" ");
  const initials = [recipient.first_name?.[0], recipient.last_name?.[0]]
    .filter(Boolean)
    .join("");
  const role = [recipient.job_title, recipient.company]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <Avatar className="h-9 w-9">
          {recipient.avatar_url && (
            <AvatarImage src={recipient.avatar_url} alt={fullName} />
          )}
          <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm text-muted-foreground">
            {fullName || "Uczestnik"}
          </span>
          {role && <span className="text-xs text-muted-foreground">{role}</span>}
        </div>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          Oczekuje na odpowiedź
        </span>
      </CardContent>
    </Card>
  );
}
