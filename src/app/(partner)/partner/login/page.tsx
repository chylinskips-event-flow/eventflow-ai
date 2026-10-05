import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/partner-portal";
import { PartnerLoginForm } from "./login-form";

export default async function PartnerLoginPage() {
  if (await getAuthUser()) redirect("/partner");
  return <PartnerLoginForm />;
}
