"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/request-origin";
import { emailHasPartnerAccess } from "@/lib/partner-portal";
import { normalizeEmail } from "@/lib/partner-portal-core";

export type PartnerLoginState = { status: "idle" | "sent" | "error"; message?: string };

/**
 * Link logowania (magic link) do panelu partnera. Wysyłany tylko na adres z dostępem
 * (aktywnym albo ważnym zaproszeniem); odpowiedź jest ta sama w obu przypadkach, żeby
 * nie dało się sprawdzić, kto jest partnerem.
 */
export async function sendPartnerLoginLink(
  _prev: PartnerLoginState,
  formData: FormData,
): Promise<PartnerLoginState> {
  const email = normalizeEmail(formData.get("email"));
  if (!email) return { status: "error", message: "Podaj poprawny adres e-mail." };

  if (await emailHasPartnerAccess(email)) {
    const origin = getOrigin(await headers());
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/partner` },
    });
    if (error) {
      console.error("[partner-portal] otp failed", JSON.stringify({ status: error.status, message: error.message }));
      return { status: "error", message: "Nie udało się wysłać linku. Spróbuj ponownie za chwilę." };
    }
  }
  return { status: "sent" };
}

export async function signOutPartner() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/partner/login");
}
