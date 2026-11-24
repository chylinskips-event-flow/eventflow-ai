import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SANITIZABLE_IMAGE_TYPES } from "@/lib/image-sanitize";

// Statyczna kontrola: po wszystkich migracjach każdy publiczny bucket ma limit typu i rozmiaru
// po stronie Storage, a aplikacja nie wgrywa do niego typu spoza listy.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const SRC = join(process.cwd(), "src");
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function migrations(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"));
}

function publicBucketsFromMigrations(): Set<string> {
  const out = new Set<string>();
  const re = /insert\s+into\s+storage\.buckets\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/gi;
  for (const sql of migrations()) {
    for (const m of sql.matchAll(re)) {
      const cols = m[1].split(",").map((c) => c.trim().toLowerCase());
      const vals = m[2].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
      if (vals[cols.indexOf("public")]?.toLowerCase() === "true") out.add(vals[cols.indexOf("id")]);
    }
  }
  return out;
}

/** Ostatnie ustawienia limitów dla bucketu (UPDATE … WHERE id = / IN (…)). */
function bucketLimits(): Map<string, { mimes: string[] | null; size: number | null }> {
  const limits = new Map<string, { mimes: string[] | null; size: number | null }>();
  const re = /update\s+storage\.buckets\s+set\s+([\s\S]*?)\s+where\s+id\s*(?:=\s*'([^']+)'|in\s*\(([^)]*)\))/gi;
  for (const sql of migrations()) {
    for (const m of sql.matchAll(re)) {
      const ids = m[2] ? [m[2]] : m[3].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
      const mimes = /allowed_mime_types\s*=\s*array\s*\[([^\]]*)\]/i.exec(m[1])?.[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
      const size = /file_size_limit\s*=\s*(\d+)/i.exec(m[1])?.[1];
      for (const id of ids) {
        const prev = limits.get(id) ?? { mimes: null, size: null };
        limits.set(id, { mimes: mimes ?? prev.mimes, size: size ? Number(size) : prev.size });
      }
    }
  }
  return limits;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const BUCKET_CONSTANTS: Record<string, string> = {
  AVATAR_BUCKET: "attendee-avatars",
  STORAGE_BUCKET: "event-sections",
  GALLERY_BUCKET: "event-photos",
};

/** Wszystkie wywołania .from(<bucket>).upload(…, { contentType }) w kodzie aplikacji. */
function appUploads(): { bucket: string; contentType: string; file: string }[] {
  const out: { bucket: string; contentType: string; file: string }[] = [];
  const re = /\.from\(\s*("([^"]+)"|[A-Z_]+)\s*\)\s*\.upload\(([\s\S]*?)\)\s*[;,)]/g;
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      const bucket = m[2] ?? BUCKET_CONSTANTS[m[1]] ?? m[1];
      const contentType = /contentType:\s*([^,}\s]+)/.exec(m[3])?.[1] ?? "(brak)";
      out.push({ bucket, contentType, file });
    }
  }
  return out;
}

describe("publiczne buckety — limity po stronie Storage", () => {
  const publicBuckets = [...publicBucketsFromMigrations(), "event-sections"];
  const limits = bucketLimits();

  it("parser widzi publiczne buckety (kontrola samego testu)", () => {
    expect(publicBuckets).toEqual(expect.arrayContaining(["event-logos", "attendee-avatars", "reward-images", "partner-logos"]));
  });

  it.each(publicBuckets)("%s: tylko JPEG/PNG/WebP i limit rozmiaru", (bucket) => {
    const l = limits.get(bucket);
    expect(l?.mimes).toEqual(ALLOWED);
    expect(l?.size).toBeGreaterThanOrEqual(4 * 1024 * 1024);
    expect(l?.size).toBeLessThanOrEqual(15 * 1024 * 1024);
  });

  it("obrazy po sanityzacji mieszczą się w dozwolonych typach", () => {
    for (const t of Object.keys(SANITIZABLE_IMAGE_TYPES)) expect(ALLOWED).toContain(t);
  });

  it("każdy upload aplikacji do publicznego bucketu wysyła dozwolony Content-Type", () => {
    const uploads = appUploads().filter((u) => publicBuckets.includes(u.bucket));
    expect(uploads.length).toBeGreaterThanOrEqual(8);
    for (const u of uploads) {
      const literal = /^"([^"]+)"$/.exec(u.contentType)?.[1];
      if (literal) expect(ALLOWED, `${u.file} → ${u.bucket}`).toContain(literal);
      else expect(u.contentType, `${u.file} → ${u.bucket}`).toBe("clean.contentType");
    }
  });
});
