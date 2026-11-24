import { createAdminClient } from "@/lib/supabase/admin";
import { pickBoothQuest } from "@/lib/booth-visit";

export type BoothQuestRow = {
  id: string;
  type: string;
  title: string;
  points_value: number | null;
  config: unknown;
};

/**
 * Bieżący quest stoiska dla uczestnika (pełny config — tylko server-side).
 * null, gdy grywalizacja wydarzenia jest wyłączona albo partner nie ma aktywnego questa.
 */
export async function getCurrentBoothQuest(params: {
  eventId: string;
  partnerId: string;
  attendeeId: string;
  gamificationEnabled: boolean;
}): Promise<BoothQuestRow | null> {
  if (!params.gamificationEnabled) return null;
  const supabase = createAdminClient();

  const { data: quests } = await supabase
    .from("quests")
    .select("id, type, title, points_value, config")
    .eq("partner_id", params.partnerId)
    .eq("event_id", params.eventId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const rows = (quests ?? []) as BoothQuestRow[];
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const { data: completions } = await supabase
    .from("quest_completions")
    .select("quest_id")
    .eq("attendee_id", params.attendeeId)
    .in(
      "quest_id",
      rows.map((q) => q.id),
    );

  return pickBoothQuest(rows, ((completions ?? []) as { quest_id: string }[]).map((c) => c.quest_id));
}
