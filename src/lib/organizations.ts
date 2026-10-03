import { createClient } from "@/lib/supabase/server";
import { redirectIfSuspended } from "@/lib/suspension";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  plan: string;
  billing_email: string | null;
  created_at: string;
  updated_at: string;
};

export async function getOwnOrganization(): Promise<Organization | null> {
  // Zawieszone konto (panel operatora) — brak dostępu do danych organizatora.
  await redirectIfSuspended();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return data;
}
