// Obrazy wgrywane do PUBLICZNYCH bucketów (awatary, zdjęcia prelegentów, logo, grafiki
// wydarzenia) — tylko serwer. Ponowne zakodowanie przez sharp usuwa wszystkie metadane
// (EXIF, w tym GPS, XMP, IPTC, komentarze); orientację z EXIF wcześniej „wypalamy” w pikselach.
// Format wyjściowy = zadeklarowany typ (JPEG/PNG/WebP), więc rozszerzenie i Content-Type
// zawsze odpowiadają treści pliku, niezależnie od nazwy pliku z przeglądarki.
import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "@/lib/gallery-core";

export const SANITIZABLE_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type SanitizableImageType = keyof typeof SANITIZABLE_IMAGE_TYPES;

export type SanitizedImage = {
  body: Buffer;
  contentType: SanitizableImageType;
  ext: (typeof SANITIZABLE_IMAGE_TYPES)[SanitizableImageType];
};

export const IMAGE_SANITIZE_ERROR = "Nie udało się odczytać obrazu. Wybierz inny plik JPG, PNG lub WebP.";

const isSanitizable = (t: string): t is SanitizableImageType => Object.hasOwn(SANITIZABLE_IMAGE_TYPES, t);

/**
 * Zwraca obraz bez metadanych w zadeklarowanym formacie albo null, gdy typ jest
 * niedozwolony lub pliku nie da się zdekodować jako obrazu.
 */
export async function stripImageMetadata(file: Blob, declaredType: string = file.type): Promise<SanitizedImage | null> {
  if (!isSanitizable(declaredType)) return null;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    let img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    if (declaredType === "image/jpeg") img = img.jpeg({ quality: 90 });
    else if (declaredType === "image/png") img = img.png();
    else img = img.webp({ quality: 90 });
    const body = await img.toBuffer();
    return { body, contentType: declaredType, ext: SANITIZABLE_IMAGE_TYPES[declaredType] };
  } catch {
    return null;
  }
}
