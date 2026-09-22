"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";
import { validateImageFile, MB } from "@/lib/upload-validation";

export type RewardFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/rewards`);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createReward(
  eventId: string,
  _prev: RewardFormState,
  formData: FormData,
): Promise<RewardFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const pointsRaw = parseInt(formData.get("points_required") as string, 10);
  const stockRaw = formData.get("stock") as string;
  const stock = stockRaw.trim() === "" ? null : parseInt(stockRaw, 10);
  const badge_label = (formData.get("badge_label") as string)?.trim() || null;

  if (!name) return { status: "error", message: "Podaj nazwę nagrody." };
  if (isNaN(pointsRaw) || pointsRaw < 0)
    return { status: "error", message: "Podaj prawidłowy próg punktowy." };
  if (stock !== null && (isNaN(stock) || stock < 0))
    return { status: "error", message: "Stan magazynu musi być liczbą >= 0 lub pustym polem." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("rewards").insert({
    event_id: eventId,
    name,
    description,
    points_required: pointsRaw,
    stock,
    badge_label,
  });

  if (error) return { status: "error", message: "Nie udało się dodać nagrody." };

  revalidate(eventId);
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateReward(
  eventId: string,
  rewardId: string,
  _prev: RewardFormState,
  formData: FormData,
): Promise<RewardFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const pointsRaw = parseInt(formData.get("points_required") as string, 10);
  const stockRaw = formData.get("stock") as string;
  const stock = stockRaw.trim() === "" ? null : parseInt(stockRaw, 10);
  const badge_label = (formData.get("badge_label") as string)?.trim() || null;

  if (!name) return { status: "error", message: "Podaj nazwę nagrody." };
  if (isNaN(pointsRaw) || pointsRaw < 0)
    return { status: "error", message: "Podaj prawidłowy próg punktowy." };
  if (stock !== null && (isNaN(stock) || stock < 0))
    return { status: "error", message: "Stan magazynu musi być liczbą >= 0 lub pustym polem." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("rewards")
    .update({ name, description, points_required: pointsRaw, stock, badge_label })
    .eq("id", rewardId)
    .eq("event_id", eventId);

  if (error) return { status: "error", message: "Nie udało się zaktualizować nagrody." };

  revalidate(eventId);
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteReward(
  eventId: string,
  rewardId: string,
): Promise<RewardFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("rewards")
    .delete()
    .eq("id", rewardId)
    .eq("event_id", eventId);

  if (error) return { status: "error", message: "Nie udało się usunąć nagrody." };

  revalidate(eventId);
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Upload image
// ---------------------------------------------------------------------------

export async function uploadRewardImage(
  eventId: string,
  rewardId: string,
  _prev: RewardFormState,
  formData: FormData,
): Promise<RewardFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0)
    return { status: "error", message: "Nie wybrano pliku." };

  const validationError = validateImageFile(file, 5 * MB);
  if (validationError) return { status: "error", message: validationError };

  // Resize + konwersja do WebP przed uploadem
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    return { status: "error", message: "Nie udało się przetworzyć obrazu." };
  }

  const path = `${eventId}/${rewardId}-${Date.now()}.webp`;

  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage
    .from("reward-images")
    .upload(path, webpBuffer, { upsert: true, contentType: "image/webp" });

  if (uploadError)
    return { status: "error", message: "Nie udało się wgrać zdjęcia." };

  const { data: { publicUrl } } = supabase.storage
    .from("reward-images")
    .getPublicUrl(path);

  const { error: dbError } = await supabase
    .from("rewards")
    .update({ image_url: publicUrl })
    .eq("id", rewardId)
    .eq("event_id", eventId);

  if (dbError)
    return { status: "error", message: "Nie udało się zapisać URL zdjęcia." };

  revalidate(eventId);
  return { status: "success", message: "Zdjęcie wgrane." };
}

// ---------------------------------------------------------------------------
// Redeem (wydanie nagrody uczestnikowi)
// ---------------------------------------------------------------------------

export type RedeemState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function redeemReward(
  eventId: string,
  rewardId: string,
  attendeeId: string,
): Promise<RedeemState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const supabase = createAdminClient();

  // 1. Odczytaj aktualny stan magazynu
  const { data: rewardRow, error: readErr } = await supabase
    .from("rewards")
    .select("id, stock")
    .eq("id", rewardId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (readErr || !rewardRow)
    return { status: "error", message: "Nagroda nie znaleziona." };

  const currentStock = (rewardRow as { id: string; stock: number | null }).stock;
  if (currentStock !== null && currentStock <= 0)
    return { status: "error", message: "Brak nagrody w magazynie." };

  // 2. Dekrementuj stock (tylko gdy skończony) — UPDATE ... WHERE stock > 0
  //    Jeśli inny proces wyścignie, affected rows = 0 → błąd
  let stockDecremented = false;
  if (currentStock !== null) {
    const { data: decremented } = await supabase
      .from("rewards")
      .update({ stock: currentStock - 1 })
      .eq("id", rewardId)
      .eq("event_id", eventId)
      .gt("stock", 0)
      .select("id");

    if (!decremented || (decremented as unknown[]).length === 0)
      return { status: "error", message: "Brak nagrody w magazynie." };
    stockDecremented = true;
  }

  // 3. INSERT reward_redemptions (PK = UNIQUE guard)
  const { error: insertError } = await supabase
    .from("reward_redemptions")
    .insert({ reward_id: rewardId, attendee_id: attendeeId });

  if (insertError) {
    // Cofnij dekrementację stock
    if (stockDecremented) {
      await supabase
        .from("rewards")
        .update({ stock: (currentStock as number) + 1 })
        .eq("id", rewardId)
        .eq("event_id", eventId);
    }
    if (insertError.code === "23505")
      return { status: "error", message: "Uczestnik już odebrał tę nagrodę." };
    return { status: "error", message: "Nie udało się wydać nagrody." };
  }

  revalidate(eventId);
  return { status: "success", message: "Nagroda wydana." };
}
