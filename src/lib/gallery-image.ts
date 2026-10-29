// Przetwarzanie zdjęć galerii (tylko serwer): obrót wg EXIF, max 2560 px, JPEG, opcjonalny znak
// wodny (logo organizatora), miniatura. Metadane (w tym GPS) nie przechodzą do wersji wynikowych.
// HEIC/HEIF (iPhone) dekoduje libheif (WASM) — sharp z paczki npm czyta z rodziny HEIF tylko AVIF.
import sharp from "sharp";
import {
  DISPLAY_MAX_PX,
  DISPLAY_QUALITY,
  MAX_INPUT_PIXELS,
  THUMB_MAX_PX,
  THUMB_QUALITY,
  UNSUPPORTED_FORMAT_MESSAGE,
  WATERMARK_OPACITY,
  watermarkBox,
} from "@/lib/gallery-core";

export class PhotoProcessingError extends Error {}

export type ProcessedPhoto = {
  display: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  watermarked: boolean;
};

/** Kontener ISO-BMFF z marką HEIC/HEIF (ftyp w bajtach 4–12). AVIF obsługuje sharp. */
export function isHeicBuffer(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString("latin1", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("latin1", 8, 12).replace("\0", " ").trim();
  return ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand);
}

async function decodeHeic(buf: Buffer): Promise<sharp.Sharp> {
  // Import dynamiczny: duży moduł WASM ładujemy tylko dla plików HEIC.
  const { default: decode } = await import("heic-decode");
  let image: { width: number; height: number; data: Uint8ClampedArray };
  try {
    image = await decode({ buffer: buf });
  } catch {
    throw new PhotoProcessingError("Nie udało się odczytać pliku HEIC.");
  }
  if (image.width * image.height > MAX_INPUT_PIXELS) {
    throw new PhotoProcessingError("Zdjęcie ma zbyt dużą rozdzielczość.");
  }
  // libheif stosuje już obrót z kontenera — nie obracamy drugi raz.
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });
}

async function openSource(buf: Buffer): Promise<sharp.Sharp> {
  if (isHeicBuffer(buf)) return decodeHeic(buf);
  let format: string | undefined;
  try {
    format = (await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/pixel limit/i.test(msg)) throw new PhotoProcessingError("Zdjęcie ma zbyt dużą rozdzielczość.");
    throw new PhotoProcessingError(UNSUPPORTED_FORMAT_MESSAGE);
  }
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new PhotoProcessingError(UNSUPPORTED_FORMAT_MESSAGE);
  }
  return sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
}

/** Logo przygotowane do nałożenia: przeskalowane, półprzezroczyste PNG. null = nie da się użyć. */
async function prepareLogo(logo: Buffer, maxWidth: number, maxHeight: number) {
  try {
    const resized = await sharp(logo)
      .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: false })
      .ensureAlpha()
      .png()
      .toBuffer({ resolveWithObject: true });
    const alpha = Math.round(255 * WATERMARK_OPACITY);
    const input = await sharp(resized.data)
      .composite([
        { input: Buffer.from([255, 255, 255, alpha]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" },
      ])
      .png()
      .toBuffer();
    return { input, width: resized.info.width, height: resized.info.height };
  } catch {
    return null;
  }
}

/**
 * @param logo — logo organizatora (z Brandingu) albo null; znak wodny tylko gdy `watermark`
 *   i logo da się odczytać. Bez logo zdjęcie zostaje bez znaku (nie podstawiamy logo Eventro).
 */
export async function processPhoto(input: Buffer, opts: { logo: Buffer | null; watermark: boolean }): Promise<ProcessedPhoto> {
  const source = await openSource(input);

  let base: { data: Buffer; info: sharp.OutputInfo };
  try {
    base = await source
      .resize({ width: DISPLAY_MAX_PX, height: DISPLAY_MAX_PX, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    if (e instanceof PhotoProcessingError) throw e;
    throw new PhotoProcessingError("Nie udało się przetworzyć zdjęcia.");
  }
  const { width, height, channels } = base.info;
  const raw = { raw: { width, height, channels } } as const;

  let watermarked = false;
  let display = sharp(base.data, raw);
  if (opts.watermark && opts.logo) {
    const box = watermarkBox(width, height);
    const logo = await prepareLogo(opts.logo, box.logoWidth, box.logoMaxHeight);
    if (logo) {
      display = display.composite([
        {
          input: logo.input,
          left: Math.max(0, width - logo.width - box.margin),
          top: Math.max(0, height - logo.height - box.margin),
        },
      ]);
      watermarked = true;
    }
  }

  const [displayBuf, thumbBuf] = await Promise.all([
    display.jpeg({ quality: DISPLAY_QUALITY, mozjpeg: true }).toBuffer(),
    sharp(base.data, raw)
      .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toBuffer(),
  ]);

  return { display: displayBuf, thumb: thumbBuf, width, height, watermarked };
}
