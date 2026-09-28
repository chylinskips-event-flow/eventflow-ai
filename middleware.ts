import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "eventro.pl";

// Subdomeny zarezerwowane — nie są slugami eventów.
const RESERVED = new Set([
  "www", "admin", "app", "api", "mail", "send", "rsend",
  "autoconfig", "autodiscover", "static", "assets", "cdn",
  "_domainkey", "resend",
]);

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;

  // Guard: jeśli żądanie już zostało przepisane, nie rób tego ponownie.
  if (!request.headers.get("x-mw-rewritten")) {
    const isEventSubdomain =
      host !== ROOT_DOMAIN &&
      host !== `www.${ROOT_DOMAIN}` &&
      !host.endsWith(".vercel.app") &&
      !host.includes("localhost") &&
      host.endsWith(`.${ROOT_DOMAIN}`);

    if (isEventSubdomain) {
      const sub = host.slice(0, host.length - ROOT_DOMAIN.length - 1);

      if (!RESERVED.has(sub)) {
        const rewriteUrl = request.nextUrl.clone();
        // "/" → "/e/{sub}", "/register" → "/e/{sub}/register", itd.
        rewriteUrl.pathname = `/e/${sub}${pathname === "/" ? "" : pathname}`;

        // Przekazujemy nagłówek loop-guard do przepisanego żądania.
        const forwardHeaders = new Headers(request.headers);
        forwardHeaders.set("x-mw-rewritten", "1");

        return NextResponse.rewrite(rewriteUrl, {
          request: { headers: forwardHeaders },
        });
      }
    }
  }

  // Domyślne: odświeżenie sesji Supabase + redirect /admin dla niezalogowanych.
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
