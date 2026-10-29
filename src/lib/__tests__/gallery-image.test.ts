import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PhotoProcessingError, isHeicBuffer, processPhoto } from "@/lib/gallery-image";

// Prawdziwy sharp: zmniejszenie, obrót wg EXIF, usunięcie metadanych, znak wodny wł./wył.

const photo = (width: number, height: number, opts: { orientation?: number } = {}) => {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } }).jpeg();
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  return img.toBuffer();
};

const logoPng = () =>
  sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 255, g: 255, b: 0, alpha: 1 } } }).png().toBuffer();

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("processPhoto", () => {
  it("zmniejsza do 2560 px (display) i ~600 px (miniatura), JPEG bez metadanych", async () => {
    const out = await processPhoto(await photo(4000, 3000), { logo: null, watermark: false });
    expect([out.width, out.height]).toEqual([2560, 1920]);
    const d = await sharp(out.display).metadata();
    const t = await sharp(out.thumb).metadata();
    expect(d.format).toBe("jpeg");
    expect([d.width, d.height]).toEqual([2560, 1920]);
    expect(Math.max(t.width!, t.height!)).toBe(600);
    expect(d.exif).toBeUndefined();
    expect(d.orientation).toBeUndefined();
  });

  it("małe zdjęcie nie jest powiększane", async () => {
    const out = await processPhoto(await photo(800, 600), { logo: null, watermark: false });
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it("obraca wg EXIF (orientacja 6 = 90°)", async () => {
    const out = await processPhoto(await photo(1200, 800, { orientation: 6 }), { logo: null, watermark: false });
    expect([out.width, out.height]).toEqual([800, 1200]);
  });

  it("znak wodny włączony + logo → logo w prawym dolnym rogu, miniatura bez znaku", async () => {
    const src = await photo(2000, 1500);
    const logo = await logoPng();
    const withMark = await processPhoto(src, { logo, watermark: true });
    const without = await processPhoto(src, { logo, watermark: false });
    expect(withMark.watermarked).toBe(true);
    expect(without.watermarked).toBe(false);

    // Środek logo: ~12% szerokości od prawej, margines ~3%.
    const x = 2000 - 45 - 120;
    const y = 1500 - 45 - 60;
    const marked = await pixel(withMark.display, x, y);
    const clean = await pixel(without.display, x, y);
    expect(marked[0]).toBeGreaterThan(clean[0] + 60); // żółte logo podnosi kanał R
    // Lewy górny róg bez zmian.
    const a = await pixel(withMark.display, 20, 20);
    const b = await pixel(without.display, 20, 20);
    expect(Math.abs(a[0] - b[0])).toBeLessThan(6);
  });

  it("znak wodny włączony, ale bez logo organizatora → zdjęcie bez znaku", async () => {
    const out = await processPhoto(await photo(1000, 800), { logo: null, watermark: true });
    expect(out.watermarked).toBe(false);
  });

  it("nieczytelne logo nie blokuje zdjęcia (bez znaku)", async () => {
    const out = await processPhoto(await photo(1000, 800), { logo: Buffer.from("nie-obraz"), watermark: true });
    expect(out.watermarked).toBe(false);
  });

  it("PNG z przezroczystością → JPEG na białym tle", async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await processPhoto(png, { logo: null, watermark: false });
    expect(await pixel(out.display, 10, 10)).toEqual([255, 255, 255]);
  });

  it("inne formaty (GIF, nie-obraz) odrzucone", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#f00" } }).gif().toBuffer();
    await expect(processPhoto(gif, { logo: null, watermark: false })).rejects.toThrow(PhotoProcessingError);
    await expect(processPhoto(Buffer.from("plain text"), { logo: null, watermark: false })).rejects.toThrow(/Nieobsługiwany format/);
  });
});

describe("HEIC", () => {
  const heicHeader = (brand: string) =>
    Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp" + brand, "latin1"), Buffer.alloc(32)]);

  it("rozpoznaje kontener HEIC/HEIF po marce (AVIF zostaje dla sharp)", () => {
    expect(isHeicBuffer(heicHeader("heic"))).toBe(true);
    expect(isHeicBuffer(heicHeader("mif1"))).toBe(true);
    expect(isHeicBuffer(heicHeader("avif"))).toBe(false);
    expect(isHeicBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });

  it("uszkodzony HEIC → czytelny błąd zamiast awarii", async () => {
    await expect(processPhoto(heicHeader("heic"), { logo: null, watermark: false })).rejects.toThrow(
      "Nie udało się odczytać pliku HEIC.",
    );
  });
});
