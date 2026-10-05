"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerContext, getProfileDraft, publishedProfile } from "@/lib/partner-portal";
import {
  MATERIAL_TITLE_MAX_LENGTH,
  MAX_MATERIALS_PER_PARTNER,
  changedProfileFields,
  normalizeEmail,
  safeFileName,
  validateMaterialFile,
  validateProfileInput,
} from "@/lib/partner-portal-core";
import { ALLOWED_IMAGE_TYPES, MB } from "@/lib/upload-validation";

// Akcje partnera. Autoryzacja przy KAŻDEJ akcji: getPartnerContext (zalogowany +
// aktywny, nieunieważniony dostęp do TEGO partnera + event dostępny). partnerId z URL
// nie wystarcza — bez wiersza partner_access nic się nie zapisze.

export type PartnerActionState = { status: "idle" | "success" | "error"; message?: string };

const NO_ACCESS = "Brak dostępu — zaloguj się ponownie albo poproś organizatora o zaproszenie.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate(partnerId: string, eventId: string) {
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath(`/admin/events/${eventId}/partners`);
  revalidatePath(`/admin/events/${eventId}/partners/${partnerId}`);
}

/** Zapis wizytówki jako szkicu do akceptacji organizatora (publicznie nic się nie zmienia). */
export async function submitPartnerProfile(
  partnerId: string,
  _prev: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };

  const parsed = validateProfileInput((k) => formData.get(k));
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const admin = createAdminClient();
  const published = publishedProfile(ctx.partner);
  const draft = await getProfileDraft(partnerId);

  // Logo: nowy plik → upload; „usuń” → brak; inaczej zostaje bieżące (szkic albo opublikowane).
  let logoUrl = draft ? draft.logo_url : published.logo_url;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!ALLOWED_IMAGE_TYPES.includes(logo.type)) {
      return { status: "error", message: "Logo: dozwolone formaty JPG, PNG, WebP." };
    }
    if (logo.size > 5 * MB) return { status: "error", message: "Logo może mieć najwyżej 5 MB." };
    const ext = logo.type === "image/png" ? "png" : logo.type === "image/webp" ? "webp" : "jpg";
    const path = `${ctx.event.id}/draft-${partnerId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("partner-logos")
      .upload(path, logo, { contentType: logo.type });
    if (uploadError) return { status: "error", message: "Nie udało się wgrać logo." };
    logoUrl = admin.storage.from("partner-logos").getPublicUrl(path).data.publicUrl;
  } else if (formData.get("remove_logo") === "on") {
    logoUrl = null;
  }

  const proposed = { ...parsed.profile, logo_url: logoUrl };
  if (changedProfileFields(published, proposed).length === 0) {
    await admin.from("partner_profile_drafts").delete().eq("partner_id", partnerId);
    revalidate(partnerId, ctx.event.id);
    return { status: "success", message: "Brak zmian względem opublikowanej wizytówki." };
  }

  const { error } = await admin.from("partner_profile_drafts").upsert(
    {
      partner_id: partnerId,
      ...proposed,
      status: "pending",
      review_note: null,
      reviewed_at: null,
      submitted_at: new Date().toISOString(),
      submitted_by: ctx.user.id,
    },
    { onConflict: "partner_id" },
  );
  if (error) {
    console.error("[partner-portal] draft save failed", JSON.stringify({ code: error.code, message: error.message }));
    return { status: "error", message: "Nie udało się zapisać zmian." };
  }

  revalidate(partnerId, ctx.event.id);
  return { status: "success", message: "Wysłano do akceptacji organizatora." };
}

/** Kontakt wewnętrzny — bez akceptacji (widzi go tylko organizator). */
export async function savePartnerContact(
  partnerId: string,
  _prev: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };

  const text = (k: string, max: number) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim().slice(0, max) || null : null;
  };
  const rawEmail = text("contact_email", 254);
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !email) return { status: "error", message: "Nieprawidłowy e-mail kontaktowy." };
  const phone = text("contact_phone", 40);
  if (phone && !/^[0-9+()\s-]{5,40}$/.test(phone)) {
    return { status: "error", message: "Nieprawidłowy numer telefonu." };
  }

  const { error } = await createAdminClient()
    .from("partner_contacts")
    .upsert(
      { partner_id: partnerId, contact_name: text("contact_name", 200), contact_email: email, contact_phone: phone },
      { onConflict: "partner_id" },
    );
  if (error) return { status: "error", message: "Nie udało się zapisać kontaktu." };

  revalidate(partnerId, ctx.event.id);
  return { status: "success", message: "Zapisano." };
}

export async function uploadPartnerMaterial(
  partnerId: string,
  _prev: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };

  const rawTitle = formData.get("title");
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) return { status: "error", message: "Podaj tytuł materiału." };
  if (title.length > MATERIAL_TITLE_MAX_LENGTH) {
    return { status: "error", message: `Tytuł może mieć najwyżej ${MATERIAL_TITLE_MAX_LENGTH} znaków.` };
  }
  const file = formData.get("file");
  const check = validateMaterialFile(file instanceof File ? file : null);
  if (!check.ok) return { status: "error", message: check.error };
  const f = file as File;

  const admin = createAdminClient();
  const { count } = await admin
    .from("partner_materials")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId);
  if ((count ?? 0) >= MAX_MATERIALS_PER_PARTNER) {
    return { status: "error", message: `Limit materiałów: ${MAX_MATERIALS_PER_PARTNER}. Usuń niepotrzebne.` };
  }

  const fileName = safeFileName(f.name);
  const path = `${ctx.event.id}/${partnerId}/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await admin.storage
    .from("partner-materials")
    .upload(path, f, { contentType: f.type });
  if (uploadError) {
    console.error("[partner-portal] material upload failed", uploadError.message);
    return { status: "error", message: "Nie udało się wgrać pliku." };
  }

  const { error } = await admin.from("partner_materials").insert({
    partner_id: partnerId,
    event_id: ctx.event.id,
    title,
    file_path: path,
    file_name: fileName,
    mime_type: f.type,
    size_bytes: f.size,
  });
  if (error) {
    await admin.storage.from("partner-materials").remove([path]);
    return { status: "error", message: "Nie udało się zapisać materiału." };
  }

  revalidate(partnerId, ctx.event.id);
  return { status: "success", message: "Materiał dodany — pojawi się po akceptacji organizatora." };
}

export async function deletePartnerMaterial(partnerId: string, materialId: string): Promise<PartnerActionState> {
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };
  if (!UUID.test(materialId)) return { status: "error", message: "Materiał nie istnieje." };

  const admin = createAdminClient();
  const { data: material } = await admin
    .from("partner_materials")
    .select("id, file_path")
    .eq("id", materialId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!material) return { status: "error", message: "Materiał nie istnieje." };

  const { error } = await admin.from("partner_materials").delete().eq("id", materialId);
  if (error) return { status: "error", message: "Nie udało się usunąć materiału." };
  await admin.storage.from("partner-materials").remove([material.file_path as string]);

  revalidate(partnerId, ctx.event.id);
  return { status: "success" };
}
