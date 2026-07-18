import { LegalHeading, LegalPlaceholder } from "@/components/legal-page";

// TREŚĆ REGULAMINU — szkielet sekcji do wypełnienia. Podmieniaj tekst tutaj;
// layout jest w LegalPage i nie wymaga zmian.
export function TermsContent() {
  return (
    <>
      <LegalPlaceholder>
        [Treść regulaminu — do uzupełnienia przed publicznym uruchomieniem]
      </LegalPlaceholder>

      <LegalHeading>Postanowienia ogólne</LegalHeading>
      <p>[Zakres regulaminu i podmiot świadczący usługę.]</p>

      <LegalHeading>Definicje</LegalHeading>
      <p>[Wyjaśnienie pojęć używanych w regulaminie.]</p>

      <LegalHeading>Zasady korzystania</LegalHeading>
      <p>[Warunki korzystania z platformy przez uczestników i organizatorów.]</p>

      <LegalHeading>Rejestracja i konto</LegalHeading>
      <p>[Zasady rejestracji na wydarzenie oraz dostępu przez link/kod uczestnika.]</p>

      <LegalHeading>Odpowiedzialność</LegalHeading>
      <p>[Zakres odpowiedzialności usługodawcy i użytkownika.]</p>

      <LegalHeading>Reklamacje</LegalHeading>
      <p>[Tryb zgłaszania i rozpatrywania reklamacji.]</p>

      <LegalHeading>Postanowienia końcowe</LegalHeading>
      <p>[Zmiany regulaminu, prawo właściwe, wejście w życie.]</p>
    </>
  );
}
