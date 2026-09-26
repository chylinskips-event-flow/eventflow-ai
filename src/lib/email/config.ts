import { BRAND_NAME_SHORT } from "@/lib/brand";

const DEV_FALLBACK = `${BRAND_NAME_SHORT} <onboarding@resend.dev>`;

export function getFromAddress(): string {
  const configured = process.env.RESEND_FROM;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[email] RESEND_FROM is not configured — set it in environment variables"
    );
  }
  console.warn(
    "[email] RESEND_FROM not set — using dev fallback. Configure RESEND_FROM for production."
  );
  return DEV_FALLBACK;
}
