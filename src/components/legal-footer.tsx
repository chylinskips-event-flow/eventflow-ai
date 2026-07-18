import Link from "next/link";

// Stopka z linkami prawnymi — trasy globalne (poza segmentem eventu).
export function LegalFooter() {
  return (
    <footer className="mt-8 border-t py-6 text-center text-xs text-muted-foreground">
      <Link href="/privacy" className="hover:underline">
        Polityka prywatności
      </Link>
      <span className="px-2">·</span>
      <Link href="/terms" className="hover:underline">
        Regulamin
      </Link>
    </footer>
  );
}
