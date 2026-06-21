"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";

export type ToggleAgendaState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export async function toggleAgendaItem(
  slug: string,
  sessionId: string,
): Promise<ToggleAgendaState> {
  // Tożsamość ustalana WYŁĄCZNIE server-side z cookie — nigdy z parametru
  // przekazanego przez klienta. Zapobiega modyfikowaniu cudzej agendy przez
  // podanie cudzego attendee_id.
  const attendee = await getCurrentAttendee(slug);

  if (!attendee) {
    return {
      status: "error",
      message: "Sesja wygasła. Zeskanuj swój kod QR ponownie, aby się zalogować.",
    };
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("agenda_items")
    .select("session_id")
    .eq("attendee_id", attendee.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("agenda_items")
      .delete()
      .eq("attendee_id", attendee.id)
      .eq("session_id", sessionId);

    if (error) {
      return {
        status: "error",
        message: "Nie udało się usunąć sesji z agendy. Spróbuj ponownie.",
      };
    }
  } else {
    const { error } = await supabase
      .from("agenda_items")
      .insert({ attendee_id: attendee.id, session_id: sessionId });

    if (error) {
      return {
        status: "error",
        message: "Nie udało się dodać sesji do agendy. Spróbuj ponownie.",
      };
    }
  }

  revalidatePath(`/e/${slug}/agenda`);
  revalidatePath(`/e/${slug}/my-agenda`);
  return { status: "success" };
}
