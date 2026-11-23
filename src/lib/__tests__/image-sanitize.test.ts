import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { stripImageMetadata } from "@/lib/image-sanitize";

// Prawdziwy sharp: obrazy do publicznych bucketów zapisujemy bez EXIF/GPS/XMP.

const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

const withExif = (format: "jpeg" | "png" | "webp", opts: { orientation?: number } = {}) =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 200, g: 20, b: 20 } } })
    .withExif({ IFD0: { Make: "TestCam", Copyright: "x" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 13/1 0/1" } })
    .withMetadata(opts.orientation ? { orientation: opts.orientation } : {})
    [format]()
    .toBuffer();

describe("stripImageMetadata", () => {
  it.each([
    ["image/jpeg", "jpeg", "jpg"],
    ["image/png", "png", "png"],
    ["image/webp", "webp", "webp"],
  ] as const)("%s: usuwa EXIF (w tym GPS), zachowuje format", async (type, format, ext) => {
    const input = await withExif(format);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await stripImageMetadata(blob(input, type));
    expect(out).not.toBeNull();
    expect(out!.contentType).toBe(type);
    expect(out!.ext).toBe(ext);
    const meta = await sharp(out!.body).metadata();
    expect(meta.format).toBe(format);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(out!.body.includes(Buffer.from("TestCam"))).toBe(false);
  });

  it("orientacja z EXIF jest wypalona w pikselach (zdjęcie z telefonu nie leży bokiem)", async () => {
    const out = await stripImageMetadata(blob(await withExif("jpeg", { orientation: 6 }), "image/jpeg"));
    const meta = await sharp(out!.body).metadata();
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(meta.orientation).toBeUndefined();
  });

  it("niedozwolony typ albo uszkodzony plik → null", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect(await stripImageMetadata(blob(svg, "image/svg+xml"))).toBeNull();
    expect(await stripImageMetadata(blob(Buffer.from("nie obraz"), "image/png"))).toBeNull();
  });
});
