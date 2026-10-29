import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUDGET_MB,
  MAX_PHOTO_BYTES,
  budgetState,
  galleryBudgetMb,
  isSha256Hex,
  photoPaths,
  uploadLinkState,
  validatePhotoFile,
  validateUploadLinkInput,
  watermarkBox,
} from "@/lib/gallery-core";

describe("validatePhotoFile — format i rozmiar", () => {
  it("JPEG, PNG, WebP i HEIC przechodzą", () => {
    expect(validatePhotoFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toEqual({ ok: true, contentType: "image/jpeg", ext: "jpg" });
    expect(validatePhotoFile({ name: "a.png", type: "image/png", size: 1000 })).toMatchObject({ ok: true, ext: "png" });
    expect(validatePhotoFile({ name: "a.webp", type: "image/webp", size: 1000 })).toMatchObject({ ok: true, ext: "webp" });
    expect(validatePhotoFile({ name: "IMG_1.HEIC", type: "image/heic", size: 1000 })).toMatchObject({ ok: true, ext: "heic" });
  });

  it("HEIC bez typu MIME (Windows) rozpoznany po rozszerzeniu", () => {
    expect(validatePhotoFile({ name: "IMG_1.heic", type: "", size: 1000 })).toEqual({ ok: true, contentType: "image/heic", ext: "heic" });
    expect(validatePhotoFile({ name: "x.heif", type: "application/octet-stream", size: 1 })).toMatchObject({ ok: true, contentType: "image/heif" });
  });

  it("inne formaty odrzucone z komunikatem", () => {
    for (const f of [
      { name: "a.gif", type: "image/gif", size: 10 },
      { name: "a.mp4", type: "video/mp4", size: 10 },
      { name: "a.pdf", type: "", size: 10 },
      // podany typ wygrywa z rozszerzeniem
      { name: "a.jpg", type: "image/gif", size: 10 },
    ]) {
      const r = validatePhotoFile(f);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Nieobsługiwany format/);
    }
  });

  it("limit 15 MB i pusty plik", () => {
    expect(validatePhotoFile({ name: "a.jpg", type: "image/jpeg", size: MAX_PHOTO_BYTES })).toMatchObject({ ok: true });
    expect(validatePhotoFile({ name: "a.jpg", type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 })).toEqual({ ok: false, error: "Plik jest większy niż 15 MB." });
    expect(validatePhotoFile({ name: "a.jpg", type: "image/jpeg", size: 0 })).toEqual({ ok: false, error: "Plik jest pusty." });
  });
});

describe("budżet miejsca na galerie", () => {
  it("domyślnie 500 MB, z env gdy poprawne", () => {
    expect(galleryBudgetMb(undefined)).toBe(DEFAULT_BUDGET_MB);
    expect(galleryBudgetMb("abc")).toBe(500);
    expect(galleryBudgetMb("700")).toBe(700);
  });

  it("ostrzeżenie od 80%, blokada od 100%", () => {
    const mb = 1024 * 1024;
    expect(budgetState(399 * mb, 500)).toMatchObject({ warn: false, blocked: false });
    expect(budgetState(400 * mb, 500)).toMatchObject({ warn: true, blocked: false });
    expect(budgetState(500 * mb, 500)).toMatchObject({ warn: true, blocked: true });
  });
});

describe("link fotografa", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  it("aktywny / unieważniony / wygasły", () => {
    expect(uploadLinkState({ revoked_at: null, expires_at: null }, now)).toBe("active");
    expect(uploadLinkState({ revoked_at: null, expires_at: "2026-11-02T00:00:00Z" }, now)).toBe("active");
    expect(uploadLinkState({ revoked_at: "2026-10-30T00:00:00Z", expires_at: null }, now)).toBe("revoked");
    expect(uploadLinkState({ revoked_at: null, expires_at: "2026-11-01T12:00:00Z" }, now)).toBe("expired");
  });

  it("walidacja nazwy i limitu zdjęć", () => {
    expect(validateUploadLinkInput(" Anna ", "")).toEqual({ ok: true, value: { label: "Anna", maxPhotos: null } });
    expect(validateUploadLinkInput("Anna", "50")).toEqual({ ok: true, value: { label: "Anna", maxPhotos: 50 } });
    expect(validateUploadLinkInput("", "")).toMatchObject({ ok: false });
    expect(validateUploadLinkInput("Anna", "0")).toMatchObject({ ok: false });
    expect(validateUploadLinkInput("Anna", "501")).toMatchObject({ ok: false });
    expect(validateUploadLinkInput("Anna", "2.5")).toMatchObject({ ok: false });
  });
});

describe("drobne", () => {
  it("ścieżki w buckecie i skrót SHA-256", () => {
    expect(photoPaths("ev", "ph", "heic")).toEqual({
      original: "ev/ph/original.heic",
      display: "ev/ph/display.jpg",
      thumb: "ev/ph/thumb.jpg",
    });
    expect(isSha256Hex("a".repeat(64))).toBe(true);
    expect(isSha256Hex("A".repeat(64))).toBe(false);
    expect(isSha256Hex("a".repeat(63))).toBe(false);
  });

  it("logo znaku wodnego ~12% szerokości, nie mniejsze niż 80 px", () => {
    expect(watermarkBox(2560, 1707).logoWidth).toBe(307);
    expect(watermarkBox(400, 300).logoWidth).toBe(80);
  });
});
