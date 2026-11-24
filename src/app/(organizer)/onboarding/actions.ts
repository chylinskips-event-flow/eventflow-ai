"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugCandidate, slugFromName } from "@/lib/slug";

export type OnboardingState = {
  status: "idle" | "error";
  message?: string;
};

const NAME_MAX_LENGTH = 200;
/** Ile wariantów `-2`, `-3`… próbujemy przy zajętym slugu (także przy wyścigu dwóch zapisów). */
const MAX_SLUG_ATTEMPTS = 50;

type DbError = { code?: string; message?: string; details?: string };

/** Kolizja unikalności sluga (nie innej kolumny) — wtedy próbujemy kolejnego wariantu. */
function isSlugConflict(error: DbError): boolean {
  return error.code === "23505" && /slug/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

/** Konto ma już organizację (unikalność owner_user_id) — np. drugie kliknięcie „Utwórz”. */
function isOwnerConflict(error: DbError): boolean {
  return error.code === "23505" && /owner_user_id/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

export async function createOrganization(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    return { status: "error", message: "Podaj nazwę firmy lub marki." };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { status: "error", message: `Nazwa może mieć najwyżej ${NAME_MAX_LENGTH} znaków.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Zapis idempotentny: konto, które ma już organizację (np. podwójne wysłanie formularza),
  // nie zakłada drugiej — wraca do panelu. Wyścig dwóch równoległych zapisów domyka
  // unikalność owner_user_id w bazie (isOwnerConflict niżej).
  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existing) redirect("/admin");

  // Konto partnera (także dawnego) może założyć organizację — dostęp partnera (partner_access)
  // jest od niej niezależny. Wybór drogi pokazuje strona /onboarding.

  // Slug organizacji jest wewnętrzny (nie występuje w adresach, mailach ani QR) — generujemy go
  // z nazwy. Unikalność pilnuje baza: przy kolizji (także dwa zapisy naraz) próbujemy -2, -3…
  // Wstępne sprawdzanie nie ma sensu — RLS pokazuje tylko własne organizacje.
  const base = slugFromName(name, "organizacja");
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const { error } = await supabase.from("organizations").insert({
      name,
      slug: slugCandidate(base, attempt),
      // E-mail do rozliczeń = adres z logowania (pole usunięte z formularza rejestracji).
      billing_email: user.email ?? null,
      owner_user_id: user.id,
    });
    if (!error) redirect("/admin");
    if (isOwnerConflict(error)) redirect("/admin");
    if (!isSlugConflict(error)) {
      console.error("[onboarding] organization insert failed", JSON.stringify({ code: error.code, message: error.message }));
      return { status: "error", message: "Nie udało się utworzyć organizacji. Spróbuj ponownie." };
    }
  }

  return { status: "error", message: "Nie udało się utworzyć organizacji. Spróbuj ponownie za chwilę." };
}
