import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: avoid writing logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard
  // to debug issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && (pathname.startsWith("/admin") || pathname === "/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Panel operatora: rola sprawdzana na każdej stronie/akcji (404 bez roli) — tu nie wymagamy
  // organizacji ani nie sprawdzamy zawieszenia konta organizatora.
  const isPlatformPanel =
    pathname === "/admin/platform" || pathname.startsWith("/admin/platform/");

  if (user && pathname.startsWith("/admin") && !isPlatformPanel) {
    const { data: organization } = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (!organization) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Zawieszone konto (panel operatora) — brak dostępu do panelu i akcji organizatora.
    const { data: suspended } = await supabase.rpc("is_current_user_suspended");
    if (suspended === true) {
      const url = request.nextUrl.clone();
      url.pathname = "/suspended";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user && pathname === "/onboarding") {
    const { data: suspended } = await supabase.rpc("is_current_user_suspended");
    if (suspended === true) {
      const url = request.nextUrl.clone();
      url.pathname = "/suspended";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT: you *must* return the supabaseResponse object as it is.
  // If you're creating a new response object, make sure to:
  // 1. Pass the request in it: NextResponse.next({ request })
  // 2. Copy over the cookies: response.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object, not the supabaseResponse object
  return supabaseResponse;
}

/**
 * Czy publiczna strona eventu jest zawieszona (event lub jego organizacja).
 * Funkcja SQL zwraca wyłącznie boolean. Błąd → false (nie wyłączamy stron przez awarię).
 */
export async function isEventSuspended(slug: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !slug) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/is_event_suspended`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
      cache: "no-store",
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}
