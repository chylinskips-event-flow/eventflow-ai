import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Polityka prywatności",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-4 py-3 sm:px-6">
        <Logo variant="adaptive" />
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol]:text-sm [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-relaxed [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:text-sm">

          <h1 className="text-2xl font-bold tracking-tight">
            Polityka prywatności serwisu Eventro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Wersja 1.0 · obowiązuje od: 25 września 2026 r.
          </p>

          <h2>1. Administrator danych</h2>
          <p>
            Administratorem danych osobowych w rozumieniu RODO (rozporządzenie
            Parlamentu Europejskiego i Rady (UE) 2016/679) jest:
          </p>
          <p>
            <strong>Employer Branding Solutions Sp. z o.o.</strong>
            <br />
            ul. Piotra Skargi 11, 95‑080 Tuszyn, woj. łódzkie, Polska
            <br />
            wpisana do rejestru przedsiębiorców Krajowego Rejestru Sądowego pod
            numerem <strong>KRS 0001078719</strong>, prowadzonego przez Sąd
            Rejonowy dla Łodzi‑Śródmieścia w Łodzi, XX Wydział Gospodarczy KRS
            <br />
            <strong>NIP:</strong> 7282880635 · <strong>REGON:</strong> 527369622
          </p>
          <p>
            Kontakt w sprawach ochrony danych:{" "}
            <strong>kontakt@eventro.pl</strong>
            <br />
            (dalej: „<strong>Administrator</strong>" lub „<strong>Operator</strong>").
          </p>
          <p>Administrator nie wyznaczył Inspektora Ochrony Danych (IOD).</p>

          <h2>2. Czego dotyczy polityka</h2>
          <p>
            Polityka opisuje, jak przetwarzamy dane osobowe w związku z
            korzystaniem z serwisu <strong>Eventro</strong> — platformy do
            obsługi wydarzeń (rejestracja uczestników, agenda, networking,
            dopasowania (matchmaking) oparte na AI, grywalizacja, nagrody).
          </p>
          <p>Dotyczy dwóch grup osób:</p>
          <ul>
            <li>
              <strong>Organizatorów</strong> — osób zakładających i prowadzących
              wydarzenia w serwisie;
            </li>
            <li>
              <strong>Uczestników</strong> — osób biorących udział w
              wydarzeniach (rejestracja odbywa się bez instalowania aplikacji).
            </li>
          </ul>

          <h2>3. Zakres przetwarzanych danych</h2>
          <p>
            <strong>Dane organizatora:</strong> adres e‑mail (logowanie przez
            link magiczny), dane wydarzeń, treści wprowadzane w panelu.
          </p>
          <p>
            <strong>Dane uczestnika:</strong>
          </p>
          <ul>
            <li>
              dane rejestracyjne: adres e‑mail, imię i nazwisko;
            </li>
            <li>
              dane profilu: firma, stanowisko, branża, zainteresowania,
              zdjęcie/awatar (opcjonalnie);
            </li>
            <li>
              indywidualny kod kontaktowy (QR) służący wymianie kontaktów;
            </li>
            <li>
              dane o aktywności: nawiązane kontakty, dopasowania (matchmaking),
              punkty, poziomy, ukończone zadania (questy), wizyty przy stoiskach
              partnerów (check‑in), odebrane nagrody, opinie/feedback;
            </li>
            <li>
              dane techniczne: adres IP, informacje o urządzeniu i przeglądarce,
              pliki cookies (§8).
            </li>
          </ul>
          <p>
            Podanie danych jest dobrowolne, ale niektóre dane (e‑mail, dane
            profilu) są niezbędne do korzystania z funkcji serwisu.
          </p>

          <h2>4. Cele i podstawy prawne przetwarzania</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-semibold">Cel</th>
                  <th className="px-4 py-2.5 text-left font-semibold">
                    Podstawa prawna (RODO)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-2.5">
                    Świadczenie usług serwisu (konto, udział w wydarzeniu,
                    agenda)
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    art. 6 ust. 1 lit. b (umowa)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Networking i dopasowania uczestników (matchmaking)
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    art. 6 ust. 1 lit. a (zgoda) lub lit. f (uzasadniony
                    interes)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Grywalizacja, punkty, nagrody
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    art. 6 ust. 1 lit. b (umowa) / lit. f
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Kontakt i obsługa zgłoszeń
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    art. 6 ust. 1 lit. f (uzasadniony interes)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Bezpieczeństwo, zapobieganie nadużyciom, logi
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    art. 6 ust. 1 lit. f
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Obowiązki prawne (np. rozliczenia, reklamacje)
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    art. 6 ust. 1 lit. c
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Statystyka i rozwój produktu
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    art. 6 ust. 1 lit. f
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>5. Odbiorcy danych i podmioty przetwarzające</h2>
          <p>
            Dane mogą być powierzane zaufanym dostawcom działającym na nasze
            zlecenie (umowy powierzenia — art. 28 RODO):
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — hosting bazy danych, uwierzytelnianie,
              przechowywanie plików;
            </li>
            <li>
              <strong>Vercel</strong> — hosting aplikacji;
            </li>
            <li>
              <strong>Resend</strong> — wysyłka wiadomości e‑mail (m.in. linki
              logowania);
            </li>
            <li>
              <strong>Anthropic</strong> — przetwarzanie na potrzeby dopasowań
              (matchmaking) opartych na AI.
            </li>
          </ul>
          <p>
            Część z tych dostawców może przetwarzać dane{" "}
            <strong>
              poza Europejskim Obszarem Gospodarczym (EOG)
            </strong>{" "}
            (np. w USA). W takim przypadku transfer odbywa się na podstawie
            odpowiednich zabezpieczeń, w szczególności standardowych klauzul
            umownych (SCC) Komisji Europejskiej.
          </p>
          <p>
            Dane mogą być udostępniane <strong>organizatorowi</strong>{" "}
            wydarzenia, w którym uczestniczy dana osoba (patrz §10), oraz — w
            zakresie zainicjowanym przez uczestnika (np. wymiana wizytówki QR) —
            innym uczestnikom.
          </p>

          <h2>6. Dopasowania (matchmaking) i profilowanie</h2>
          <p>
            W serwisie działa funkcja rekomendacji kontaktów oparta na AI: na
            podstawie danych profilu (branża, stanowisko, zainteresowania, cele)
            system proponuje osoby, z którymi warto się skontaktować, wraz z
            uzasadnieniem i propozycją pierwszego pytania.
          </p>
          <p>
            Jest to forma <strong>profilowania</strong>, które{" "}
            <strong>nie wywołuje skutków prawnych</strong> ani nie wpływa
            istotnie na sytuację osoby w rozumieniu art. 22 RODO — służy
            wyłącznie ułatwieniu networkingu. Uczestnik może ukryć swój profil w
            rekomendacjach (ustawienie widoczności w networkingu).
          </p>

          <h2>7. Okres przechowywania</h2>
          <p>Dane przechowujemy przez czas niezbędny do realizacji celów:</p>
          <ul>
            <li>
              dane konta i profilu — do czasu usunięcia konta/danych lub
              zakończenia korzystania z serwisu;
            </li>
            <li>
              dane związane z wydarzeniem — przez czas trwania wydarzenia i do
              12 miesięcy po jego zakończeniu;
            </li>
            <li>
              dane rozliczeniowe — przez okres wymagany przepisami prawa;
            </li>
            <li>
              logi techniczne — przez okres niezbędny dla bezpieczeństwa.
            </li>
          </ul>

          <h2>8. Pliki cookies</h2>
          <p>
            Serwis wykorzystuje pliki cookies i podobne technologie:{" "}
            <strong>niezbędne</strong> (sesja, logowanie, bezpieczeństwo) oraz —
            jeśli dotyczy — <strong>statystyczne/analityczne</strong>. Cookies
            niezbędne są konieczne do działania serwisu; pozostałe wymagają
            zgody, którą można wycofać.
          </p>

          <h2>9. Prawa osób, których dane dotyczą</h2>
          <p>
            Przysługuje Ci prawo do: dostępu do danych, sprostowania, usunięcia
            („prawo do bycia zapomnianym"), ograniczenia przetwarzania,
            przenoszenia danych, wniesienia sprzeciwu, a także — w zakresie, w
            jakim przetwarzanie odbywa się na podstawie zgody — jej wycofania w
            dowolnym momencie (bez wpływu na zgodność z prawem przetwarzania
            sprzed wycofania).
          </p>
          <p>
            Masz również prawo wniesienia skargi do organu nadzorczego —{" "}
            <strong>
              Prezesa Urzędu Ochrony Danych Osobowych (PUODO)
            </strong>
            , ul. Stawki 2, 00‑193 Warszawa.
          </p>
          <p>
            W celu realizacji praw skontaktuj się z Administratorem:{" "}
            <strong>kontakt@eventro.pl</strong>.
          </p>

          <h2>10. Rola organizatora i operatora (podział ról)</h2>
          <p>
            W modelu, w którym Operator (Employer Branding Solutions Sp. z o.o.)
            udostępnia platformę, a niezależny <strong>organizator</strong>{" "}
            prowadzi własne wydarzenie:
          </p>
          <ul>
            <li>
              w odniesieniu do danych uczestników danego wydarzenia{" "}
              <strong>administratorem może być organizator</strong>, a Operator
              działać jako{" "}
              <strong>podmiot przetwarzający</strong> (na podstawie umowy
              powierzenia);
            </li>
            <li>
              w odniesieniu do danych kont, rozliczeń i rozwoju produktu{" "}
              <strong>administratorem jest Operator</strong>.
            </li>
          </ul>
          <p>
            W okresie pilotażu, w którym wydarzenie prowadzi bezpośrednio
            Operator, administratorem jest Operator.
          </p>

          <h2>11. Zmiany polityki</h2>
          <p>
            Polityka może być aktualizowana. O istotnych zmianach poinformujemy
            w serwisie lub e‑mailem. Data ostatniej aktualizacji jest wskazana
            na początku dokumentu.
          </p>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}
