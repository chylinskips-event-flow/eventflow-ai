"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/request-origin";
import { getInviteByToken } from "@/lib/partner-portal";

export type InviteLoginState = { status: "idle" | "sent" | "error"; message?: string };

/** Magic link na adres z zaproszenia (adres bierzemy z bazy, nie z formularza). */
export async function sendInviteLoginLink(token: string): Promise<InviteLoginState> {
  const invite = await getInviteByToken(token);
  if (!invite || invite.access.user_id) {
    return { status: "error", message: "Zaproszenie jest nieaktualne." };
  }
  if (new Date(invite.access.invite_expires_at).getTime() <= Date.now()) {
    return { status: "error", message: "Zaproszenie wygasło. Poproś organizatora o nowe." };
  }
  const origin = getOrigin(await headers());
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: invite.access.email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/partner` },
  });
  if (error) {
    console.error("[partner-portal] invite otp failed", JSON.stringify({ status: error.status, message: error.message }));
    return { status: "error", message: "Nie udało się wysłać linku. Spróbuj ponownie za chwilę." };
  }
  return { status: "sent" };
}
