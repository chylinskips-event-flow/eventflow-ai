import { LegalHeading, LegalPlaceholder } from "@/components/legal-page";

// TREŚĆ POLITYKI PRYWATNOŚCI — szkielet sekcji do wypełnienia. Podmieniaj tekst
// tutaj; layout (max-w-2xl, h1, prose) jest w LegalPage i nie wymaga zmian.
export function PrivacyContent() {
  return (
    <>
      <LegalPlaceholder>
        [Treść polityki prywatności — do uzupełnienia przed publicznym
        uruchomieniem]
      </LegalPlaceholder>

      <LegalHeading>Administrator danych</LegalHeading>
      <p>[Kto jest administratorem danych osobowych i jak się z nim skontaktować.]</p>

      <LegalHeading>Zakres danych</LegalHeading>
      <p>[Jakie dane zbieramy — dane rejestracyjne, profil networkingowy, zdjęcie, kontakty.]</p>

      <LegalHeading>Cele przetwarzania</LegalHeading>
      <p>[W jakich celach przetwarzamy dane i na jakiej podstawie prawnej.]</p>

      <LegalHeading>Udostępnianie</LegalHeading>
      <p>
        [Komu udostępniamy dane — w tym innym uczestnikom w ramach networkingu
        (profil, kontakt po obopólnej zgodzie) oraz dostawcy AI wykorzystywanemu
        do generowania rekomendacji kontaktów.]
      </p>

      <LegalHeading>Okres przechowywania</LegalHeading>
      <p>[Jak długo przechowujemy dane po zakończeniu wydarzenia.]</p>

      <LegalHeading>Prawa osoby</LegalHeading>
      <p>
        [Prawa osoby, której dane dotyczą — w tym prawo do usunięcia danych,
        dostępu, sprostowania i sprzeciwu.]
      </p>

      <LegalHeading>Kontakt</LegalHeading>
      <p>[Dane kontaktowe w sprawach dotyczących ochrony danych osobowych.]</p>
    </>
  );
}
