import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MB, ORGANIZER_IMAGE_MAX_BYTES, validateImageFile } from "@/lib/upload-validation";

// Obrazy organizatora idą w body Server Action; platforma odrzuca żądania powyżej ~4,5 MB,
// zanim akcja zwróci czytelny komunikat — limit musi być poniżej tej granicy.

const file = (size: number, type = "image/jpeg") => ({ size, type }) as unknown as File;

describe("limit obrazów organizatora", () => {
  it("mieści się w limicie body funkcji (4,5 MB)", () => {
    expect(ORGANIZER_IMAGE_MAX_BYTES).toBeLessThanOrEqual(4 * MB);
  });

  it("walidacja klienta: 4 MB przechodzi, więcej → komunikat z limitem", () => {
    expect(validateImageFile(file(ORGANIZER_IMAGE_MAX_BYTES), ORGANIZER_IMAGE_MAX_BYTES)).toBeNull();
    expect(validateImageFile(file(4.8 * MB), ORGANIZER_IMAGE_MAX_BYTES)).toBe("Maksymalny rozmiar: 4MB.");
  });

  const dir = join(process.cwd(), "src/app/(organizer)/admin/events/[eventId]");
  it.each([
    "actions.ts",
    "content/actions.ts",
    "content/event-sections-actions.ts",
    "partners/actions.ts",
    "speakers/actions.ts",
    "rewards/actions.ts",
    "badges/badge-bg-upload.tsx",
    "content/banner-upload.tsx",
    "content/section-image-upload.tsx",
    "form.tsx",
    "partners/partner-form-dialog.tsx",
    "partners/partner-logo-upload.tsx",
    "rewards/reward-image-upload.tsx",
    "speakers/speaker-photo-upload.tsx",
  ])("%s używa wspólnego limitu", (f) => {
    const src = readFileSync(join(dir, f), "utf8");
    expect(src).toContain("ORGANIZER_IMAGE_MAX_BYTES");
    expect(src).not.toMatch(/[58] \* 1024 \* 1024|[58] \* MB|niż [58] ?MB|maks\. [58] MB/);
  });
});
