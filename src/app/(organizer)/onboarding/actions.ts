"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = {
  status: "idle" | "error";
  message?: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createOrganization(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = formData.get("name");
  const slug = formData.get("slug");
  const billingEmail = formData.get("billing_email");

  if (typeof name !== "string" || !name.trim()) {
    return { status: "error", message: "Podaj nazwę organizacji." };
  }

  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    return {
      status: "error",
      message:
        "Adres może zawierać tylko małe litery, cyfry i myślniki (np. moja-firma).",
    };
  }

  if (typeof billingEmail !== "string" || !billingEmail.trim()) {
    return { status: "error", message: "Podaj email do rozliczeń." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return {
      status: "error",
      message: "Ten adres jest już zajęty, wybierz inny.",
    };
  }

  const { error } = await supabase.from("organizations").insert({
    name: name.trim(),
    slug,
    billing_email: billingEmail.trim(),
    owner_user_id: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Ten adres jest już zajęty, wybierz inny.",
      };
    }
    return {
      status: "error",
      message: "Nie udało się utworzyć organizacji. Spróbuj ponownie.",
    };
  }

  redirect("/admin");
}
