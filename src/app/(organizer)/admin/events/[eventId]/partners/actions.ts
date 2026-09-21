"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PARTNER_TIERS } from "@/lib/partner-options";

export type PartnerFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  warning?: boolean;
};

const TIER_VALUES = PARTNER_TIERS.map((t) => t.value) as readonly string[];

function readPartnerFields(formData: FormData) {
  const name = formData.get("name");
  const description = formData.get("description");
  const tier = formData.get("tier");
  const boothLocation = formData.get("booth_location");

  if (typeof name !== "string" || !name.trim()) {
    return { error: "Podaj nazwę partnera." } as const;
  }

  // Tier opcjonalny; jeśli podany, musi być z listy.
  const tierValue =
    typeof tier === "string" && tier.trim() ? tier.trim() : null;
  if (tierValue && !TIER_VALUES.includes(tierValue)) {
    return { error: "Nieprawidłowy poziom partnerstwa." } as const;
  }

  return {
    fields: {
      name: name.trim(),
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
      tier: tierValue,
      booth_location:
        typeof boothLocation === "string" && boothLocation.trim()
          ? boothLocation.trim()
          : null,
    },
  } as const;
}

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

type LogoUploadResult =
  | "ok"
  | "invalid_type"
  | "too_large"
  | "upload_error"
  | "update_error";

async function uploadPartnerLogoAndUpdateRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  partnerId: string,
  logo: File,
): Promise<LogoUploadResult> {
  if (!ALLOWED_LOGO_TYPES.includes(logo.type)) {
    return "invalid_type";
  }

  if (logo.size > MAX_LOGO_SIZE_BYTES) {
    return "too_large";
  }

  const extension = logo.name.split(".").pop() ?? "png";
  const path = `${eventId}/${partnerId}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("partner-logos")
    .upload(path, logo, { contentType: logo.type, upsert: true });

  if (uploadError) {
    return "upload_error";
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("partner-logos").getPublicUrl(path);

  const { error } = await supabase
    .from("partners")
    .update({ logo_url: publicUrl })
    .eq("id", partnerId);

  if (error) {
    return "update_error";
  }

  return "ok";
}

export async function createPartner(
  eventId: string,
  _prevState: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const parsed = readPartnerFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();
  const { data: partner, error } = await supabase
    .from("partners")
    .insert({ event_id: eventId, ...parsed.fields })
    .select("id")
    .single();

  if (error || !partner) {
    return {
      status: "error",
      message: "Nie udało się dodać partnera. Spróbuj ponownie.",
    };
  }

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const result = await uploadPartnerLogoAndUpdateRecord(
      supabase,
      eventId,
      partner.id,
      logo,
    );

    if (result !== "ok") {
      revalidatePath(`/admin/events/${eventId}/partners`);
      const message =
        result === "invalid_type"
          ? "Partner dodany, ale logo nie zostało zapisane – dozwolone formaty: JPEG, PNG, WebP."
          : result === "too_large"
            ? "Partner dodany, ale logo nie zostało zapisane – plik jest większy niż 5MB."
            : "Partner dodany, ale nie udało się zapisać logo – możesz dodać je później w edycji.";
      return { status: "success", warning: true, message };
    }
  }

  revalidatePath(`/admin/events/${eventId}/partners`);
  return { status: "success", message: "Partner dodany." };
}

export async function updatePartner(
  eventId: string,
  partnerId: string,
  _prevState: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const parsed = readPartnerFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("partners")
    .update(parsed.fields)
    .eq("id", partnerId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/partners`);
  return { status: "success", message: "Zapisano zmiany." };
}

export async function uploadPartnerLogo(
  eventId: string,
  partnerId: string,
  _prevState: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik logo." };
  }

  const supabase = await createClient();
  const result = await uploadPartnerLogoAndUpdateRecord(
    supabase,
    eventId,
    partnerId,
    file,
  );

  if (result === "invalid_type") {
    return {
      status: "error",
      message: "Logo musi być w formacie JPEG, PNG lub WebP.",
    };
  }

  if (result === "too_large") {
    return { status: "error", message: "Logo nie może być większe niż 5MB." };
  }

  if (result === "upload_error") {
    return {
      status: "error",
      message: "Nie udało się wgrać logo. Spróbuj ponownie.",
    };
  }

  if (result === "update_error") {
    return {
      status: "error",
      message: "Nie udało się zapisać logo. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/partners`);
  return { status: "success", message: "Logo zapisane." };
}

export async function deletePartner(
  eventId: string,
  partnerId: string,
): Promise<PartnerFormState> {
  const supabase = await createClient();

  // Kaskada FK (20260707100000) usuwa powiązane check-iny i zadania stoiska.
  const { error } = await supabase
    .from("partners")
    .delete()
    .eq("id", partnerId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: `Nie udało się usunąć partnera: ${error.message}`,
    };
  }

  revalidatePath(`/admin/events/${eventId}/partners`);
  return { status: "success", message: "Partner usunięty." };
}
