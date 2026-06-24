"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnEvent } from "@/lib/events";
import {
  buildStructuredHtml,
  type MessageTemplateType,
} from "@/lib/message-templates";

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
  const bodyMode = formData.get("body_mode") as "structured" | "html";

  const subjectValue =
    typeof subject === "string" && subject.trim() ? subject.trim() : null;

  const supabase = await createClient();

  if (bodyMode === "html") {
    const body = formData.get("body");
    if (typeof body !== "string" || !body.trim()) {
      return { status: "error", message: "Treść szablonu nie może być pusta." };
    }
    const { error } = await supabase
      .from("event_message_templates")
      .upsert(
        {
          event_id: eventId,
          template_type: templateType,
          subject: subjectValue,
          body: body.trim(),
          body_mode: "html",
          body_heading: null,
          body_main: null,
          body_footer: null,
        },
        { onConflict: "event_id,template_type" },
      );
    if (error) {
      return { status: "error", message: "Nie udało się zapisać szablonu. Spróbuj ponownie." };
    }
  } else {
    const heading = formData.get("body_heading");
    const main = formData.get("body_main");
    const footer = formData.get("body_footer");

    if (typeof main !== "string" || !main.trim()) {
      return { status: "error", message: "Treść wiadomości nie może być pusta." };
    }

    const headingValue =
      typeof heading === "string" && heading.trim() ? heading.trim() : null;
    const mainValue = main.trim();
    const footerValue =
      typeof footer === "string" && footer.trim() ? footer.trim() : null;

    const body = buildStructuredHtml(templateType, headingValue, mainValue, footerValue);

    const { error } = await supabase
      .from("event_message_templates")
      .upsert(
        {
          event_id: eventId,
          template_type: templateType,
          subject: subjectValue,
          body,
          body_mode: "structured",
          body_heading: headingValue,
          body_main: mainValue,
          body_footer: footerValue,
        },
        { onConflict: "event_id,template_type" },
      );
    if (error) {
      return { status: "error", message: "Nie udało się zapisać szablonu. Spróbuj ponownie." };
    }
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
