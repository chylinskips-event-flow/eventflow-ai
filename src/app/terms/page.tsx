import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Regulamin",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-4 py-3 sm:px-6">
        <Logo variant="adaptive" />
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol]:text-sm [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-relaxed [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:text-sm">

          <h1 className="text-2xl font-bold tracking-tight">
            Regulamin serwisu Eventro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Wersja 1.0 · obowiązuje od: 25 września 2026 r.
          </p>

          <h2>§1. Definicje</h2>
          <ul>
            <li>
              <strong>Operator</strong> — Employer Branding Solutions Sp. z
              o.o., ul. Piotra Skargi 11, 95‑080 Tuszyn, KRS 0001078719, NIP
              7282880635, REGON 527369622.
            </li>
            <li>
              <strong>Serwis / Eventro</strong> — platforma internetowa
              dostępna pod adresem <strong>eventro.pl</strong> służąca do
              obsługi wydarzeń.
            </li>
            <li>
              <strong>Organizator</strong> — podmiot (zwykle przedsiębiorca)
              tworzący i prowadzący Wydarzenie w Serwisie.
            </li>
            <li>
              <strong>Uczestnik</strong> — osoba fizyczna biorąca udział w
              Wydarzeniu za pośrednictwem Serwisu.
            </li>
            <li>
              <strong>Wydarzenie</strong> — konferencja, targi lub inne
              spotkanie obsługiwane w Serwisie.
            </li>
            <li>
              <strong>Konto</strong> — zbiór zasobów i uprawnień przypisanych
              Organizatorowi po zalogowaniu.
            </li>
            <li>
              <strong>Grywalizacja</strong> — mechanizmy punktów, poziomów,
              zadań (questów), rankingu i nagród.
            </li>
          </ul>

          <h2>§2. Postanowienia ogólne</h2>
          <ol>
            <li>Regulamin określa zasady korzystania z Serwisu Eventro.</li>
            <li>
              Operator świadczy usługi drogą elektroniczną zgodnie z ustawą z
              dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną.
            </li>
            <li>
              Do korzystania z Serwisu niezbędne są: urządzenie z dostępem do
              internetu, aktualna przeglądarka i aktywny adres e‑mail.
            </li>
            <li>Zakazane jest dostarczanie treści o charakterze bezprawnym.</li>
          </ol>

          <h2>§3. Rejestracja i konta</h2>
          <ol>
            <li>
              <strong>Organizator</strong> loguje się za pomocą linku
              wysyłanego na adres e‑mail (logowanie bez hasła — „link
              magiczny").
            </li>
            <li>
              <strong>Uczestnik</strong> dołącza do Wydarzenia bez instalowania
              aplikacji, podając dane wymagane przez formularz rejestracji
              Wydarzenia; udział może wymagać zatwierdzenia przez Organizatora.
            </li>
            <li>
              Podane dane powinny być prawdziwe i aktualne. Zabronione jest
              korzystanie z kont innych osób.
            </li>
          </ol>

          <h2>§4. Zasady korzystania</h2>
          <ol>
            <li>
              <strong>Organizator</strong> tworzy i konfiguruje Wydarzenia
              (agenda, prelegenci, partnerzy, questy, nagrody, komunikaty) oraz
              zarządza listą Uczestników.
            </li>
            <li>
              <strong>Uczestnik</strong> może uzupełnić profil, przeglądać
              agendę, nawiązywać kontakty (m.in. przez kod QR), korzystać z
              rekomendacji (matchmaking) oraz brać udział w grywalizacji.
            </li>
            <li>
              Operator może czasowo ograniczyć dostęp do Serwisu z przyczyn
              technicznych lub bezpieczeństwa.
            </li>
          </ol>

          <h2>§5. Grywalizacja i nagrody</h2>
          <ol>
            <li>
              Uczestnicy mogą zdobywać punkty za aktywność (np. uzupełnienie
              profilu, nawiązywanie kontaktów, wizyty przy stoiskach partnerów,
              udział w sesjach).
            </li>
            <li>
              Zasady przyznawania punktów, progi poziomów oraz pula nagród są
              określane przez Organizatora danego Wydarzenia.
            </li>
            <li>
              <strong>Nagrody</strong> wydawane są zgodnie z zasadami i
              dostępnością ustaloną przez Organizatora. Odbiór nagrody może
              wymagać posiadania odpowiedniej liczby punktów.
            </li>
            <li>Loteria / losowanie nie jest obecnie oferowane w Serwisie.</li>
            <li>
              Nagrody nie podlegają wymianie na ekwiwalent pieniężny, chyba że
              Organizator postanowi inaczej.
            </li>
          </ol>

          <h2>§6. Treści i własność intelektualna</h2>
          <ol>
            <li>
              Prawa do Serwisu, jego oprogramowania, marki i logotypu{" "}
              <strong>Eventro</strong> przysługują Operatorowi.
            </li>
            <li>
              Organizator odpowiada za treści i dane wprowadzane w ramach
              swojego Wydarzenia oraz oświadcza, że ma do nich odpowiednie
              prawa.
            </li>
          </ol>

          <h2>§7. Płatności</h2>
          <p>
            Korzystanie z Serwisu w ramach pilotażu jest <strong>bezpłatne</strong>.
          </p>

          <h2>§8. Prawa i obowiązki, zakazane działania</h2>
          <p>
            Zabronione jest w szczególności: naruszanie prawa lub praw osób
            trzecich, przesyłanie treści bezprawnych lub obraźliwych,
            podszywanie się pod inne osoby, zakłócanie działania Serwisu,
            nieuprawnione pozyskiwanie danych innych Uczestników.
          </p>

          <h2>§9. Odpowiedzialność</h2>
          <ol>
            <li>
              Operator dokłada starań, aby Serwis działał prawidłowo, jednak nie
              gwarantuje nieprzerwanej dostępności.
            </li>
            <li>
              Operator nie ponosi odpowiedzialności za treści i decyzje
              Organizatorów ani za skutki kontaktów nawiązanych między
              Uczestnikami.
            </li>
            <li>
              Ograniczenia odpowiedzialności nie wyłączają praw przysługujących
              konsumentom na podstawie przepisów bezwzględnie obowiązujących.
            </li>
          </ol>

          <h2>§10. Reklamacje</h2>
          <ol>
            <li>
              Reklamacje można składać na adres{" "}
              <strong>kontakt@eventro.pl</strong>.
            </li>
            <li>
              Reklamacja powinna zawierać opis problemu i dane kontaktowe.
            </li>
            <li>
              Operator rozpatruje reklamacje w terminie <strong>14 dni</strong>{" "}
              od otrzymania.
            </li>
          </ol>

          <h2>§11. Odstąpienie od umowy (konsumenci)</h2>
          <p>
            Jeżeli Uczestnik jest konsumentem, przysługuje mu prawo odstąpienia
            od umowy zawartej na odległość w terminie <strong>14 dni</strong>{" "}
            od jej zawarcia, bez podania przyczyny, na zasadach wynikających z
            ustawy o prawach konsumenta. Oświadczenie o odstąpieniu można złożyć
            na adres <strong>kontakt@eventro.pl</strong>.
          </p>

          <h2>§12. Dane osobowe</h2>
          <p>
            Zasady przetwarzania danych osobowych określa{" "}
            <strong>
              <Link href="/privacy" className="underline underline-offset-2 hover:text-primary">
                Polityka prywatności
              </Link>
            </strong>{" "}
            dostępna pod adresem /privacy.
          </p>

          <h2>§13. Zmiany regulaminu i postanowienia końcowe</h2>
          <ol>
            <li>
              Operator może zmienić Regulamin z ważnych przyczyn; o zmianach
              informuje w Serwisie lub e‑mailem.
            </li>
            <li>W sprawach nieuregulowanych stosuje się prawo polskie.</li>
            <li>
              Ewentualne spory rozstrzyga sąd właściwy według przepisów; w
              relacjach z konsumentami — sąd właściwy zgodnie z przepisami o
              ochronie konsumentów.
            </li>
          </ol>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}
