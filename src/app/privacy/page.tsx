import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PrivacyContent } from "./content";

export const metadata: Metadata = {
  title: "Polityka prywatności",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Polityka prywatności">
      <PrivacyContent />
    </LegalPage>
  );
}
