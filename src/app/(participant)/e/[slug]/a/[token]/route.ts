import { NextResponse, type NextRequest } from "next/server";
import {
  getAttendeeByTokenAndSlug,
  ATTENDEE_TOKEN_COOKIE,
  ATTENDEE_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/attendee-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  const attendee = await getAttendeeByTokenAndSlug(token, slug);

  if (!attendee) {
    return NextResponse.redirect(
      new URL(`/e/${slug}/a/status?reason=invalid`, request.url),
    );
  }

  if (attendee.status === "pending") {
    return NextResponse.redirect(
      new URL(`/e/${slug}/a/status?reason=pending`, request.url),
    );
  }

  if (attendee.status === "rejected") {
    return NextResponse.redirect(
      new URL(`/e/${slug}/a/status?reason=rejected`, request.url),
    );
  }

  // status === 'approved' — token może pochodzić z innego urządzenia niż to,
  // na którym odbyła się rejestracja (typowy scenariusz: rejestracja na
  // laptopie, skan QR telefonem na evencie), więc cookie ZAWSZE ustawiamy
  // tutaj na nowo, niezależnie od tego, czy już istnieje.
  const response = NextResponse.redirect(new URL(`/e/${slug}`, request.url));
  response.cookies.set(ATTENDEE_TOKEN_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/e/${slug}`,
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  });
  return response;
}
