// Walidacja plików obrazów PRZED wysłaniem na serwer. Plik przekraczający limit
// body Server Actions (6MB w next.config) jest odrzucany przez framework (413)
// zanim akcja się uruchomi — walidacja server-side nigdy nie dostaje szansy i
// strona crashuje. Ten helper (client-safe, bez importów server-only) blokuje
// zły plik po stronie klienta; walidacja w akcjach zostaje jako druga linia
// obrony dla żądań omijających UI.

export const MB = 1024 * 1024;

// Obrazy organizatora idą w body Server Action, a funkcje platformy przyjmują najwyżej
// ~4,5 MB żądania — większy plik zostałby odrzucony, zanim akcja zwróci komunikat.
export const ORGANIZER_IMAGE_MAX_BYTES = 4 * MB;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Zwraca komunikat błędu, albo null gdy plik jest OK.
export function validateImageFile(file: File, maxBytes: number): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Dozwolone formaty: JPG, PNG, WebP.";
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / MB);
    return `Maksymalny rozmiar: ${mb}MB.`;
  }
  return null;
}
