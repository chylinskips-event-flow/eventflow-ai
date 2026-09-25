import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CalendarClock,
  Handshake,
  LayoutDashboard,
  Mail,
  QrCode,
  Radio,
  ScanLine,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/legal-footer";
import { Logo } from "@/components/logo";

// Maska feather wtapiająca krawędzie zdjęcia w tło strony (bg cloud #F7F8FC).
const featherStyle = {
  maskImage:
    "radial-gradient(78% 82% at 54% 44%, #000 38%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 82%)",
  WebkitMaskImage:
    "radial-gradient(78% 82% at 54% 44%, #000 38%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 82%)",
};

// Wariant B jako meta description (SEO) — reszta metadanych (title template,
// tagline) dziedziczy z root layoutu.
export const metadata: Metadata = {
  description:
    "Platforma eventowa z networkingiem opartym na AI — rejestracja, agenda i inteligentne dopasowania kontaktów w jednym miejscu.",
};

// Trzy grupy odbiorców — do kogo mówi produkt i co z tego mają.
const groups = [
  {
    icon: LayoutDashboard,
    title: "Dla organizatorów",
    description:
      "Uruchom rejestrację, ułóż agendę i moderuj uczestników z jednego panelu. Bez wdrożeń i bez kodu.",
  },
  {
    icon: UserRound,
    title: "Dla uczestników",
    description:
      "Wejście przez link, agenda w telefonie i podpowiedzi, z kim warto się poznać. Wszystko bez instalowania aplikacji.",
  },
  {
    icon: Handshake,
    title: "Dla partnerów",
    description:
      "Docieraj do właściwych uczestników i zbieraj kontakty w zgodzie z RODO, dzięki wymianie za zgodą obu stron.",
  },
];

// Sześć kluczowych funkcji — każda odpowiada realnej możliwości platformy.
const features = [
  {
    icon: QrCode,
    title: "Rejestracja bez aplikacji",
    description:
      "Uczestnik rejestruje się w 30 sekund i wchodzi na wydarzenie przez link lub kod QR — bez pobierania czegokolwiek.",
  },
  {
    icon: Radio,
    title: "Agenda na żywo",
    description:
      "Sekcja „Co teraz trwa”, prywatna „Moja agenda” i pełny program — zawsze aktualne, w strefie czasowej wydarzenia.",
  },
  {
    icon: Sparkles,
    title: "Networking z AI",
    description:
      "Algorytm dobiera każdemu uczestnikowi najlepsze kontakty i tłumaczy, dlaczego warto porozmawiać właśnie z tą osobą.",
  },
  {
    icon: ScanLine,
    title: "Wymiana kontaktów QR",
    description:
      "Poznajesz kogoś na żywo — skanujecie kody i macie kontakt. Prośby o kontakt działają też zdalnie, za zgodą obu stron.",
  },
  {
    icon: Users,
    title: "Profile uczestników",
    description:
      "Wizytówka z rolą, firmą i zainteresowaniami. Widoczność w liście networkingowej włączasz jednym przełącznikiem.",
  },
  {
    icon: Mail,
    title: "Podsumowanie po evencie",
    description:
      "Dzień po wydarzeniu każdy dostaje mail z listą nawiązanych kontaktów — żeby rozmowy nie skończyły się na sali.",
  },
];

// Jak to działa — trzy kroki od utworzenia wydarzenia do kontaktów po evencie.
const steps = [
  {
    title: "Utwórz wydarzenie",
    description:
      "Załóż wydarzenie, ustaw agendę i prelegentów, otwórz rejestrację. Stronę wydarzenia dostajesz od razu.",
  },
  {
    title: "Uczestnicy dołączają",
    description:
      "Rejestrują się przez link, uzupełniają profil networkingowy i przeglądają agendę na swoich telefonach.",
  },
  {
    title: "AI łączy właściwych ludzi",
    description:
      "W trakcie wydarzenia podpowiada kontakty i ułatwia wymianę, a po nim podsumowuje poznane osoby mailem.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <Logo variant="adaptive" />
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Panel organizatora</Link>
        </Button>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <div className="flex flex-col items-center gap-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
            {/* Lewa kolumna — tekst */}
            <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5" />
                Networking napędzany AI
              </span>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Wydarzenia, które łączą właściwych ludzi
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground text-balance">
                Rejestracja w 30 sekund bez aplikacji, agenda na żywo i networking
                z AI, który podpowiada uczestnikom, z kim naprawdę warto
                porozmawiać — i dlaczego.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">
                    Załóż wydarzenie <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="#jak-to-dziala">Zobacz, jak to działa</Link>
                </Button>
              </div>
            </div>

            {/* Prawa kolumna — zdjęcie */}
            <div className="w-full max-w-lg lg:max-w-none">
              <Image
                src="/hero/hero-questy.webp"
                alt="Uczestniczka wydarzenia korzystająca z Eventro na telefonie podczas networkingu"
                width={1000}
                height={1000}
                preload={true}
                fetchPriority="high"
                sizes="(min-width:1024px) 42vw, 90vw"
                className="w-full max-h-[280px] object-cover object-top lg:max-h-none lg:h-auto"
                style={featherStyle}
              />
            </div>
          </div>
        </section>

        {/* Trzy grupy odbiorców */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.title}
                className="flex flex-col gap-3 rounded-xl border bg-background p-6"
              >
                <group.icon className="size-8 text-primary" />
                <h2 className="text-lg font-semibold">{group.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {group.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features grid 6 */}
        <section className="mx-auto max-w-5xl px-4 py-20">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Wszystko, czego potrzebuje udane wydarzenie
            </h2>
            <p className="mt-3 text-muted-foreground">
              Od rejestracji po kontakty nawiązane długo po ostatniej sesji.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-3 rounded-xl border p-6"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Jak to działa — 3 kroki */}
        <section id="jak-to-dziala" className="border-t bg-muted/40">
          <div className="mx-auto max-w-5xl px-4 py-20">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Jak to działa
              </h2>
              <p className="mt-3 text-muted-foreground">
                Trzy kroki od pomysłu na wydarzenie do wartościowych kontaktów.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.title} className="flex flex-col gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                    {index + 1}
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA końcowe */}
        <section className="mx-auto max-w-6xl px-4 py-24">
          <div className="flex flex-col items-center gap-10 text-center lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:text-left">
            {/* Tekst + przycisk */}
            <div className="flex flex-col items-center gap-6 lg:items-start">
              <CalendarClock className="size-10 text-primary" />
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Gotowy na wydarzenie, które łączy ludzi?
              </h2>
              <p className="max-w-xl text-muted-foreground">
                Uruchom rejestrację i networking z AI już dziś — bez wdrożeń, bez
                aplikacji dla uczestników.
              </p>
              <Button asChild size="lg">
                <Link href="/login">
                  Załóż wydarzenie <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            {/* Zdjęcie */}
            <div className="w-full max-w-lg lg:max-w-none">
              <Image
                src="/hero/hero-nagrody.webp"
                alt="Uczestniczka wydarzenia świętująca z pucharem — owacje na sali"
                width={1000}
                height={1000}
                sizes="(min-width:1024px) 42vw, 90vw"
                className="w-full max-h-[280px] object-cover object-top lg:max-h-none lg:h-auto"
                style={featherStyle}
              />
            </div>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
