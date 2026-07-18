// Wspólny layout stron prawnych (/privacy, /terms). Treść każdej strony żyje
// w osobnym pliku content — podmiana tekstu nie wymaga dotykania tego layoutu.
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </main>
  );
}

// Wyróżniony placeholder — ma rzucać się w oczy, żeby nie trafić na produkcję
// z pustą treścią.
export function LegalPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-amber-900">
      {children}
    </p>
  );
}

// Nagłówek sekcji szkieletu.
export function LegalHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 text-base font-semibold text-foreground">{children}</h2>
  );
}
