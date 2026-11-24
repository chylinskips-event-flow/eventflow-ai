import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_INPUT_PIXELS } from "@/lib/gallery-core";

// HEIC: limit rozdzielczości sprawdzany z nagłówka kontenera, ZANIM libheif zdekoduje piksele.

const heic = vi.hoisted(() => ({
  width: 0,
  height: 0,
  decodeCalls: 0,
  disposeCalls: 0,
  failAll: false,
}));

vi.mock("heic-decode", () => {
  const one = async () => {
    throw new Error("nie używać: dekoduje bez sprawdzenia wymiarów");
  };
  const all = async () => {
    if (heic.failAll) throw new Error("HEIF image not found");
    const list = [
      {
        width: heic.width,
        height: heic.height,
        decode: async () => {
          heic.decodeCalls++;
          return { width: heic.width, height: heic.height, data: new Uint8ClampedArray(heic.width * heic.height * 4).fill(200) };
        },
      },
    ];
    return Object.assign(list, { dispose: () => void heic.disposeCalls++ });
  };
  return { default: Object.assign(one, { all }) };
});

import { processPhoto } from "@/lib/gallery-image";

const heicHeader = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(32)]);

describe("HEIC — limit przed dekodowaniem", () => {
  beforeEach(() => {
    Object.assign(heic, { width: 0, height: 0, decodeCalls: 0, disposeCalls: 0, failAll: false });
  });

  it("za duża rozdzielczość w nagłówku → odrzucone bez dekodowania pikseli", async () => {
    heic.width = 20_000;
    heic.height = Math.ceil(MAX_INPUT_PIXELS / 20_000) + 1;
    await expect(processPhoto(heicHeader, { logo: null, watermark: false })).rejects.toThrow("Zdjęcie ma zbyt dużą rozdzielczość.");
    expect(heic.decodeCalls).toBe(0);
    expect(heic.disposeCalls).toBe(1);
  });

  it("zerowe wymiary → czytelny błąd, bez dekodowania", async () => {
    await expect(processPhoto(heicHeader, { logo: null, watermark: false })).rejects.toThrow("Nie udało się odczytać pliku HEIC.");
    expect(heic.decodeCalls).toBe(0);
  });

  it("uszkodzony kontener → czytelny błąd", async () => {
    heic.failAll = true;
    await expect(processPhoto(heicHeader, { logo: null, watermark: false })).rejects.toThrow("Nie udało się odczytać pliku HEIC.");
  });

  it("poprawny rozmiar → dekodowanie i przetworzenie, pamięć WASM zwolniona", async () => {
    heic.width = 400;
    heic.height = 300;
    const out = await processPhoto(heicHeader, { logo: null, watermark: false });
    expect([out.width, out.height]).toEqual([400, 300]);
    expect(heic.decodeCalls).toBe(1);
    expect(heic.disposeCalls).toBe(1);
  });
});
