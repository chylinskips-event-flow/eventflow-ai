import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Czy organizacja zalogowanego użytkownika jest zawieszona przez operatora.
 * Druga warstwa obok middleware — egzekwowana w kodzie serwera (strony, akcje, route handlery)
 * oraz w bazie (polityki RESTRICTIVE). Cache'owane na czas jednego requestu.
 * Błąd sprawdzenia → log + false (zapisy i tak blokuje baza).
 */
export const isCurrentUserSuspended = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_current_user_suspended");
  if (error) {
    console.warn(
      "[suspension] check failed",
      JSON.stringify({ code: error.code, message: error.message }),
    );
    return false;
  }
  return data === true;
});

/** Przekierowanie zawieszonego organizatora na /suspended. */
export async function redirectIfSuspended(): Promise<void> {
  if (await isCurrentUserSuspended()) redirect("/suspended");
}
