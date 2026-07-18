import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { TermsContent } from "./content";

export const metadata: Metadata = {
  title: "Regulamin",
};

export default function TermsPage() {
  return (
    <LegalPage title="Regulamin">
      <TermsContent />
    </LegalPage>
  );
}
