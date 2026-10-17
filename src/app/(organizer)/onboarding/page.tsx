import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
import { getPartnerAccountStatus } from "@/lib/partner-portal";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const organization = await getOwnOrganization();

  if (organization) {
    redirect("/admin");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Konto partnera (także z cofniętym dostępem) nie zakłada organizacji — /partner pokaże właściwy ekran.
  // Tu trafia m.in. z /admin (middleware) i z /auth/callback bez parametru next.
  if ((await getPartnerAccountStatus({ id: user.id, email: user.email ?? "" })) !== "none") {
    redirect("/partner");
  }

  return <OnboardingForm email={user.email ?? ""} />;
}
