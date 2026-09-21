"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";

export type QuestFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/quests`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseConfig(
  type: string,
  formData: FormData,
): { config: unknown; error?: string } {
  if (type === "booth_quiz") {
    const question = (formData.get("config_question") as string)?.trim();
    if (!question) return { config: null, error: "Podaj pytanie quizowe." };

    const optionLabels = formData.getAll("config_option_label") as string[];
    const optionIds = formData.getAll("config_option_id") as string[];
    const correctId = (formData.get("config_correct_id") as string)?.trim();

    if (optionLabels.length < 2)
      return { config: null, error: "Quiz wymaga minimum 2 opcji." };

    const options = optionIds.map((id, i) => ({
      id,
      label: optionLabels[i]?.trim() ?? "",
    }));

    if (options.some((o) => !o.label))
      return { config: null, error: "Wszystkie opcje muszą mieć treść." };

    if (!correctId || !options.find((o) => o.id === correctId))
      return { config: null, error: "Zaznacz dokładnie jedną poprawną odpowiedź." };

    return { config: { question, options, correct_id: correctId } };
  }

  if (type === "booth_password") {
    const password = (formData.get("config_password") as string)?.trim();
    if (!password) return { config: null, error: "Podaj hasło dla tego questa." };
    return { config: { password } };
  }

  return { config: null };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createQuest(
  eventId: string,
  _prevState: QuestFormState,
  formData: FormData,
): Promise<QuestFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const type = (formData.get("type") as string)?.trim();
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const pointsRaw = parseInt(formData.get("points_value") as string, 10);
  const points = isNaN(pointsRaw) || pointsRaw < 0 ? 0 : pointsRaw;
  const partnerId = (formData.get("partner_id") as string) || null;
  const targetRaw = parseInt(formData.get("target_value") as string, 10);
  const targetValue =
    type === "networking_contacts"
      ? isNaN(targetRaw) || targetRaw < 1
        ? null
        : targetRaw
      : null;

  if (!title) return { status: "error", message: "Podaj tytuł questa." };

  if (type === "networking_contacts" && (!targetValue || targetValue < 1)) {
    return { status: "error", message: "Podaj cel liczbowy (min. 1 kontakt)." };
  }

  if (["booth_visit", "booth_quiz", "booth_password"].includes(type) && !partnerId) {
    return { status: "error", message: "Wybierz partnera dla questa stoiskowego." };
  }

  const { config, error: configError } = parseConfig(type, formData);
  if (configError) return { status: "error", message: configError };

  const supabase = createAdminClient();
  const { error } = await supabase.from("quests").insert({
    event_id: eventId,
    type,
    title,
    description,
    points_value: points,
    partner_id: partnerId || null,
    target_value: targetValue,
    config,
  });

  if (error) {
    return { status: "error", message: "Nie udało się zapisać questa. Spróbuj ponownie." };
  }

  revalidate(eventId);
  return { status: "success", message: "Quest dodany." };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateQuest(
  eventId: string,
  questId: string,
  _prevState: QuestFormState,
  formData: FormData,
): Promise<QuestFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const type = (formData.get("type") as string)?.trim();
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const pointsRaw = parseInt(formData.get("points_value") as string, 10);
  const points = isNaN(pointsRaw) || pointsRaw < 0 ? 0 : pointsRaw;
  const partnerId = (formData.get("partner_id") as string) || null;
  const targetRaw = parseInt(formData.get("target_value") as string, 10);
  const targetValue =
    type === "networking_contacts"
      ? isNaN(targetRaw) || targetRaw < 1
        ? null
        : targetRaw
      : null;
  const isActive = formData.get("is_active") === "true";

  if (!title) return { status: "error", message: "Podaj tytuł questa." };

  if (type === "networking_contacts" && (!targetValue || targetValue < 1)) {
    return { status: "error", message: "Podaj cel liczbowy (min. 1 kontakt)." };
  }

  if (["booth_visit", "booth_quiz", "booth_password"].includes(type) && !partnerId) {
    return { status: "error", message: "Wybierz partnera dla questa stoiskowego." };
  }

  const { config, error: configError } = parseConfig(type, formData);
  if (configError) return { status: "error", message: configError };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("quests")
    .update({
      type,
      title,
      description,
      points_value: points,
      partner_id: partnerId || null,
      target_value: targetValue,
      config,
      is_active: isActive,
    })
    .eq("id", questId)
    .eq("event_id", eventId);

  if (error) {
    return { status: "error", message: "Nie udało się zaktualizować questa. Spróbuj ponownie." };
  }

  revalidate(eventId);
  return { status: "success", message: "Quest zaktualizowany." };
}

// ---------------------------------------------------------------------------
// Toggle active
// ---------------------------------------------------------------------------

export async function toggleQuestActive(
  eventId: string,
  questId: string,
  isActive: boolean,
): Promise<QuestFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("quests")
    .update({ is_active: isActive })
    .eq("id", questId)
    .eq("event_id", eventId);

  if (error) return { status: "error", message: "Nie udało się zmienić statusu." };

  revalidate(eventId);
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteQuest(
  eventId: string,
  questId: string,
): Promise<QuestFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("quests")
    .delete()
    .eq("id", questId)
    .eq("event_id", eventId);

  if (error) return { status: "error", message: "Nie udało się usunąć questa." };

  revalidate(eventId);
  return { status: "success", message: "Quest usunięty." };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seedQuests(
  eventId: string,
): Promise<QuestFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const supabase = createAdminClient();

  const { data: partners } = await supabase
    .from("partners")
    .select("id, name")
    .eq("event_id", eventId)
    .order("name", { ascending: true });

  const seeds: object[] = [
    {
      event_id: eventId,
      type: "profile_complete",
      title: "Uzupełnij profil",
      description: "Uzupełnij firmę, stanowisko, branżę, zainteresowania i cel przyjazdu.",
      points_value: 20,
      is_active: true,
    },
    {
      event_id: eventId,
      type: "networking_contacts",
      title: "Poznaj 3 osoby",
      description: "Nawiąż kontakt z 3 uczestnikami wydarzenia.",
      points_value: 30,
      target_value: 3,
      is_active: true,
    },
  ];

  for (const partner of partners ?? []) {
    seeds.push({
      event_id: eventId,
      type: "booth_visit",
      title: `Odwiedź stoisko: ${(partner as { id: string; name: string }).name}`,
      description: "Zeskanuj kod QR przy stoisku partnera.",
      points_value: 10,
      partner_id: (partner as { id: string; name: string }).id,
      is_active: true,
    });
  }

  const { error } = await supabase.from("quests").insert(seeds);

  if (error) {
    return { status: "error", message: "Nie udało się dodać przykładowych questów." };
  }

  revalidate(eventId);
  return { status: "success", message: "Dodano przykładowe questy." };
}
