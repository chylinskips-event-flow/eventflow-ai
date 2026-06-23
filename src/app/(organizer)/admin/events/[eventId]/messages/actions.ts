"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnEvent } from "@/lib/events";
import type { MessageTemplateType } from "@/lib/message-templates";

export type TemplateFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function upsertTemplate(
  eventId: string,
  templateType: MessageTemplateType,
  _prevState: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) {
    return { status: "error", message: "Event nie został znaleziony." };
  }

  const subject = formData.get("subject");
  const body = formData.get("body");

  if (typeof body !== "string" || !body.trim()) {
    return { status: "error", message: "Treść szablonu nie może być pusta." };
  }

  const subjectValue =
    typeof subject === "string" && subject.trim() ? subject.trim() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_message_templates")
    .upsert(
      {
        event_id: eventId,
        template_type: templateType,
        subject: subjectValue,
        body: body.trim(),
      },
      { onConflict: "event_id,template_type" },
    );

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać szablonu. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/messages`);
  return { status: "success", message: "Szablon zapisany." };
}

export async function deleteTemplate(
  eventId: string,
  templateType: MessageTemplateType,
): Promise<TemplateFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) {
    return { status: "error", message: "Event nie został znaleziony." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_message_templates")
    .delete()
    .eq("event_id", eventId)
    .eq("template_type", templateType);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się przywrócić domyślnego szablonu.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/messages`);
  return { status: "success", message: "Przywrócono szablon domyślny." };
}
