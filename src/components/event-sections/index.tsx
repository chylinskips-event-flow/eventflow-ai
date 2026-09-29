import type { EventSection } from "@/lib/event-sections";
import type { OpisContent, FaqContent, CtaContent, DojazdContent, NoclegContent, GaleriaContent, HighlightsContent } from "@/lib/event-sections";
import { SectionOpis } from "./section-opis";
import { SectionFaq } from "./section-faq";
import { SectionCta } from "./section-cta";
import { SectionDojazd } from "./section-dojazd";
import { SectionNocleg } from "./section-nocleg";
import { SectionGaleria } from "./section-galeria";
import { SectionHighlights } from "./section-highlights";

interface Props {
  sections: EventSection[];
}

export async function EventSectionsRenderer({ sections }: Props) {
  if (!sections.length) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return (
    <>
      {sections.map((section) => {
        const c = section.content as Record<string, unknown>;
        switch (section.type) {
          case "opis":
            return <SectionOpis key={section.id} content={c as unknown as OpisContent} />;
          case "faq":
            return <SectionFaq key={section.id} content={c as unknown as FaqContent} />;
          case "cta":
            return <SectionCta key={section.id} content={c as unknown as CtaContent} />;
          case "dojazd":
            return <SectionDojazd key={section.id} content={c as unknown as DojazdContent} />;
          case "nocleg":
            return <SectionNocleg key={section.id} content={c as unknown as NoclegContent} />;
          case "galeria":
            return <SectionGaleria key={section.id} content={c as unknown as GaleriaContent} supabaseUrl={supabaseUrl} />;
          case "highlights":
            return <SectionHighlights key={section.id} content={c as unknown as HighlightsContent} />;
          default:
            return null;
        }
      })}
    </>
  );
}
