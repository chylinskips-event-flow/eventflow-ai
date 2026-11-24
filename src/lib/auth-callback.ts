// Dokąd przekierować po powrocie z linku logowania (/auth/callback).
// Czyste funkcje — testowane jednostkowo.

const DEFAULT_NEXT = "/admin";

/** Ścieżka docelowa z parametru `next`: tylko ścieżki tej samej domeny (bez `//`, `\`, schematów). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next) || next.includes("@")) {
    return DEFAULT_NEXT;
  }
  return next;
}

/** Czy link logowania należał do panelu partnera (zaproszenie albo logowanie partnera). */
export function isPartnerPath(path: string): boolean {
  return path === "/partner" || path.startsWith("/partner/") || path.startsWith("/partner?");
}

/**
 * Strona logowania po nieudanej wymianie kodu (link wygasł, użyty, otwarty w innej przeglądarce).
 * Partner wraca na logowanie partnera z komunikatem, organizator — na swoje logowanie.
 */
export function failedLoginRedirectPath(next: string | null | undefined): string {
  return isPartnerPath(safeNextPath(next)) ? "/partner/login?error=link" : "/login";
}
