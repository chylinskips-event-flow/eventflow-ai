"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";
import {
  encryptSecret,
  decryptSecret,
  getPaymentConfig,
  testConnection,
} from "@/lib/p24";

export type PaymentConfigState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export async function savePaymentConfig(
  eventId: string,
  _prev: PaymentConfigState,
  formData: FormData,
): Promise<PaymentConfigState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Brak dostepu." };

  const posId = formData.get("pos_id");
  const merchantId = formData.get("merchant_id");
  const apiKeyRaw = formData.get("api_key");
  const crcRaw = formData.get("crc");
  const sandbox = formData.get("sandbox") === "on";
  const enabled = formData.get("enabled") === "on";

  if (typeof posId !== "string" || !posId.trim())
    return { status: "error", message: "Pole Pos ID jest wymagane." };
  if (typeof merchantId !== "string" || !merchantId.trim())
    return { status: "error", message: "Pole Merchant ID jest wymagane." };

  const supabase = createAdminClient();

  // Fetch existing to preserve encrypted secrets if fields left blank
  const { data: existing } = await supabase
    .from("organizer_payment_config")
    .select("api_key_enc, crc_enc")
    .eq("organization_id", event.organization_id)
    .eq("provider", "p24")
    .maybeSingle();

  let apiKeyEnc: string;
  let crcEnc: string;

  try {
    if (typeof apiKeyRaw === "string" && apiKeyRaw.trim()) {
      apiKeyEnc = encryptSecret(apiKeyRaw.trim());
    } else if (existing?.api_key_enc) {
      apiKeyEnc = existing.api_key_enc; // preserve
    } else {
      return { status: "error", message: "Klucz API jest wymagany przy pierwszym zapisie." };
    }

    if (typeof crcRaw === "string" && crcRaw.trim()) {
      crcEnc = encryptSecret(crcRaw.trim());
    } else if (existing?.crc_enc) {
      crcEnc = existing.crc_enc; // preserve
    } else {
      return { status: "error", message: "CRC jest wymagane przy pierwszym zapisie." };
    }
  } catch {
    return { status: "error", message: "Brak P24_ENCRYPTION_KEY — skontaktuj sie z administratorem." };
  }

  const { error } = await supabase
    .from("organizer_payment_config")
    .upsert(
      {
        organization_id: event.organization_id,
        provider: "p24",
        pos_id: posId.trim(),
        merchant_id: merchantId.trim(),
        api_key_enc: apiKeyEnc,
        crc_enc: crcEnc,
        sandbox,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    );

  if (error)
    return { status: "error", message: "Nie udalo sie zapisac konfiguracji." };

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { status: "success", message: "Konfiguracja P24 zapisana." };
}

export type TestConnectionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export async function testP24Connection(
  eventId: string,
): Promise<TestConnectionState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Brak dostepu." };

  const cfg = await getPaymentConfig(event.organization_id);
  if (!cfg) return { status: "error", message: "Brak konfiguracji P24." };

  const result = await testConnection(cfg);
  if (!result.ok) return { status: "error", message: result.error };
  return { status: "success", message: result.data.message };
}

export async function getPaymentConfigMasked(eventId: string): Promise<{
  posId: string;
  merchantId: string;
  hasApiKey: boolean;
  hasCrc: boolean;
  sandbox: boolean;
  enabled: boolean;
} | null> {
  const event = await getOwnEvent(eventId);
  if (!event) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organizer_payment_config")
    .select("pos_id, merchant_id, api_key_enc, crc_enc, sandbox, enabled")
    .eq("organization_id", event.organization_id)
    .eq("provider", "p24")
    .maybeSingle();

  if (!data) return null;
  return {
    posId: data.pos_id,
    merchantId: data.merchant_id,
    hasApiKey: !!data.api_key_enc,
    hasCrc: !!data.crc_enc,
    sandbox: data.sandbox,
    enabled: data.enabled,
  };
}
