import { NextResponse, type NextRequest } from "next/server";
import {
  getAttendeeByTokenAndSlug,
  ATTENDEE_TOKEN_COOKIE,
  ATTENDEE_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/attendee-session";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  const origin = getOrigin(request.headers);

  function eventPath(path: string) {
    return new URL(buildEventInternalPath(slug, path, origin) || "/", origin);
  }

  const attendee = await getAttendeeByTokenAndSlug(token, slug);

  if (!attendee) {
    return NextResponse.redirect(eventPath("/a/status?reason=invalid"));
  }

  if (attendee.status === "pending") {
    return NextResponse.redirect(eventPath("/a/status?reason=pending"));
  }

  if (attendee.status === "rejected") {
    return NextResponse.redirect(eventPath("/a/status?reason=rejected"));
  }

  // status === 'approved' — token może pochodzić z innego urządzenia niż to,
  // na którym odbyła się rejestracja (typowy scenariusz: rejestracja na
  // laptopie, skan QR telefonem na evencie), więc cookie ZAWSZE ustawiamy
  // tutaj na nowo, niezależnie od tego, czy już istnieje.
  const response = NextResponse.redirect(eventPath(""));
  response.cookies.set(ATTENDEE_TOKEN_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  });
  return response;
}
