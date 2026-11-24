import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Statyczna kontrola migracji: po zastosowaniu wszystkich migracji (w kolejności nazw)
// bucket attendee-avatars nie ma polityki SELECT na storage.objects — publiczne adresy
// działają bez niej, a polityka pozwalała listować wszystkie obiekty bucketu.

const DIR = join(process.cwd(), "supabase", "migrations");

function activeStoragePolicies(): Map<string, string> {
  const active = new Map<string, string>(); // nazwa polityki → treść
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(DIR, file), "utf8");
    const re = /(create|drop)\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+storage\.objects([\s\S]*?);/gi;
    for (const m of sql.matchAll(re)) {
      if (m[1].toLowerCase() === "create") active.set(m[2], m[3]);
      else active.delete(m[2]);
    }
  }
  return active;
}

describe("polityki Storage", () => {
  it("attendee-avatars: brak polityki SELECT (brak listowania bucketu)", () => {
    const selects = [...activeStoragePolicies().entries()].filter(
      ([, body]) => /for\s+select/i.test(body) && body.includes("'attendee-avatars'"),
    );
    expect(selects).toEqual([]);
  });

  it("parser widzi polityki innych bucketów (kontrola samego testu)", () => {
    expect(activeStoragePolicies().has("public can view speaker photos")).toBe(true);
  });
});
