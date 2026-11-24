import { NextResponse, type NextRequest } from "next/server";
import { ATTENDEE_TOKEN_COOKIE, ATTENDEE_TOKEN_MAX_AGE_SECONDS } from "@/lib/attendee-session";
import {
  CHECKOUT_SESSION_COOKIE,
  getPaidOrderAttendeeToken,
  isOwnCheckoutSession,
} from "@/lib/checkout-return";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";

/**
 * Po opłaconym zakupie: przeglądarka, która rozpoczęła płatność (ciasteczko sesji płatności),
 * zostaje zalogowana jako uczestnik — tak jak po bilecie darmowym — i trafia na stronę wydarzenia.
 * W pozostałych przypadkach tylko przekierowanie na stronę wydarzenia (dostęp przez link z maila).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const origin = getOrigin(request.headers);
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const response = NextResponse.redirect(
    new URL(buildEventInternalPath(slug, "", origin) || "/", origin),
  );

  if (!isOwnCheckoutSession(request.cookies.get(CHECKOUT_SESSION_COOKIE)?.value, sessionId)) {
    return response;
  }

  const token = await getPaidOrderAttendeeToken(sessionId!, slug);
  if (!token) return response;

  response.cookies.set(ATTENDEE_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  });
  // Jednorazowo: po zalogowaniu ciasteczko sesji płatności nie jest już potrzebne.
  response.cookies.delete(CHECKOUT_SESSION_COOKIE);
  return response;
}
