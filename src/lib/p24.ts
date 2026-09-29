/**
 * Przelewy24 REST API client — server-only.
 * Secrets (api_key, crc) are encrypted with AES-256-GCM.
 * P24_ENCRYPTION_KEY env: 64 hex chars (32 bytes).
 * NEXT_PUBLIC_ never used; never log secrets.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// ---- Encryption ------------------------------------------------------------

function getEncKey(): Buffer {
  const hex = process.env.P24_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64)
    throw new Error("P24_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): string {
  const key = getEncKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(encoded: string): string {
  const key = getEncKey();
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format");
  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ---- Config type -----------------------------------------------------------

export type P24Config = {
  id: string;
  organization_id: string;
  pos_id: string;
  merchant_id: string;
  api_key: string; // plaintext after decrypt
  crc: string;     // plaintext after decrypt
  sandbox: boolean;
  enabled: boolean;
};

// ---- DB access -------------------------------------------------------------

export async function getPaymentConfig(
  organizationId: string,
): Promise<P24Config | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organizer_payment_config")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "p24")
    .maybeSingle();
  if (!data) return null;
  try {
    return {
      id: data.id,
      organization_id: data.organization_id,
      pos_id: data.pos_id,
      merchant_id: data.merchant_id,
      api_key: decryptSecret(data.api_key_enc),
      crc: decryptSecret(data.crc_enc),
      sandbox: data.sandbox,
      enabled: data.enabled,
    };
  } catch {
    return null;
  }
}

// ---- P24 utilities ---------------------------------------------------------

export function getP24BaseUrl(sandbox: boolean): string {
  return sandbox
    ? "https://sandbox.przelewy24.pl"
    : "https://secure.przelewy24.pl";
}

function basicAuth(posId: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${posId}:${apiKey}`).toString("base64")}`;
}

function sha384(input: string): string {
  return createHash("sha384").update(input).digest("hex");
}

// ---- Sign computation (per P24 REST docs) ----------------------------------

export function computeRegisterSign(
  sessionId: string,
  merchantId: number,
  amount: number,
  currency: string,
  crc: string,
): string {
  return sha384(JSON.stringify({ sessionId, merchantId, amount, currency, crc }));
}

export function computeVerifySign(
  sessionId: string,
  orderId: number,
  amount: number,
  currency: string,
  crc: string,
): string {
  return sha384(JSON.stringify({ sessionId, orderId, amount, currency, crc }));
}

export function computeNotifySign(
  merchantId: number,
  posId: number,
  sessionId: string,
  amount: number,
  originAmount: number,
  currency: string,
  orderId: number,
  methodId: number,
  statement: string,
  crc: string,
): string {
  return sha384(
    JSON.stringify({
      merchantId,
      posId,
      sessionId,
      amount,
      originAmount,
      currency,
      orderId,
      methodId,
      statement,
      crc,
    }),
  );
}

// ---- API calls -------------------------------------------------------------

type P24Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function registerTransaction(
  cfg: P24Config,
  params: {
    sessionId: string;
    amount: number;
    description: string;
    email: string;
    urlReturn: string;
    urlStatus: string;
  },
): Promise<P24Result<{ token: string }>> {
  const base = getP24BaseUrl(cfg.sandbox);
  const merchantId = parseInt(cfg.merchant_id, 10);
  const posId = parseInt(cfg.pos_id, 10);
  const sign = computeRegisterSign(
    params.sessionId,
    merchantId,
    params.amount,
    "PLN",
    cfg.crc,
  );

  const body = {
    merchantId,
    posId,
    sessionId: params.sessionId,
    amount: params.amount,
    currency: "PLN",
    description: params.description,
    email: params.email,
    country: "PL",
    language: "pl",
    urlReturn: params.urlReturn,
    urlStatus: params.urlStatus,
    sign,
  };

  try {
    const res = await fetch(`${base}/api/v1/transaction/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(cfg.pos_id, cfg.api_key),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `P24 HTTP ${res.status}` };
    }
    const json = await res.json() as { data?: { token?: string }; error?: unknown };
    if (!json.data?.token) return { ok: false, error: "No token in P24 response" };
    return { ok: true, data: { token: json.data.token } };
  } catch (err) {
    return { ok: false, error: "P24 register request failed" };
  }
}

export async function verifyTransaction(
  cfg: P24Config,
  params: {
    sessionId: string;
    orderId: number;
    amount: number;
  },
): Promise<P24Result<{ status: string }>> {
  const base = getP24BaseUrl(cfg.sandbox);
  const merchantId = parseInt(cfg.merchant_id, 10);
  const posId = parseInt(cfg.pos_id, 10);
  const sign = computeVerifySign(
    params.sessionId,
    params.orderId,
    params.amount,
    "PLN",
    cfg.crc,
  );

  const body = {
    merchantId,
    posId,
    sessionId: params.sessionId,
    amount: params.amount,
    currency: "PLN",
    orderId: params.orderId,
    sign,
  };

  try {
    const res = await fetch(`${base}/api/v1/transaction/verify`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(cfg.pos_id, cfg.api_key),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `P24 HTTP ${res.status}` };
    const json = await res.json() as { data?: { status?: string } };
    return { ok: true, data: { status: json.data?.status ?? "unknown" } };
  } catch {
    return { ok: false, error: "P24 verify request failed" };
  }
}

export async function testConnection(
  cfg: P24Config,
): Promise<P24Result<{ message: string }>> {
  const base = getP24BaseUrl(cfg.sandbox);
  try {
    const res = await fetch(`${base}/api/v1/testAccess`, {
      method: "GET",
      headers: {
        Authorization: basicAuth(cfg.pos_id, cfg.api_key),
      },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `P24 HTTP ${res.status} — sprawdź dane konfiguracji.` };
    return { ok: true, data: { message: "Połączenie OK" } };
  } catch {
    return { ok: false, error: "Nie można połączyć się z P24." };
  }
}
