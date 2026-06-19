import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
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

  return <OnboardingForm defaultEmail={user.email ?? ""} />;
}
