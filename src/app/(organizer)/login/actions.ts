"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/request-origin";

export type MagicLinkState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function signInWithMagicLink(
  _prevState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = formData.get("email");

  if (typeof email !== "string" || !email) {
    return { status: "error", message: "Podaj adres email." };
  }

  const headersList = await headers();
  const origin = getOrigin(headersList);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/admin`,
    },
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "sent" };
}
