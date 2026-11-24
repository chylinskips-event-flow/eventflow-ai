import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/partner-portal";
import { PartnerLoginForm } from "./login-form";

/** Komunikat po nieudanym linku logowania (przekierowanie z /auth/callback). */
const LINK_ERROR =
  "Link logowania wygasł, został już użyty albo otwarto go w innej przeglądarce. Wyślij nowy link poniżej i otwórz go w tej samej przeglądarce.";

export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (await getAuthUser()) redirect("/partner");
  const { error } = await searchParams;
  return <PartnerLoginForm notice={error === "link" ? LINK_ERROR : undefined} />;
}
