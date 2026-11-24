import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Statyczna kontrola migracji: każda wciąż obowiązująca polityka odczytu dla anon
// na tabelach wydarzeń pomija wydarzenia usunięte i zawieszone.
// Odtwarzamy stan polityk, przechodząc migracje w kolejności (CREATE / DROP POLICY).

const DIR = join(process.cwd(), "supabase", "migrations");

type Policy = { table: string; body: string };

function currentPolicies(): Map<string, Policy> {
  const policies = new Map<string, Policy>();
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const stmt = /(create|drop)\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+([\w.]+)([^;]*);/gi;
  for (const file of files) {
    const sql = readFileSync(join(DIR, file), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(stmt)) {
      const [, kind, name, rawTable, rest] = m;
      const table = rawTable.toLowerCase().replace(/^public\./, "");
      const key = `${table}:${name}`;
      if (kind.toLowerCase() === "drop") policies.delete(key);
      else policies.set(key, { table, body: rest.toLowerCase() });
    }
  }
  return policies;
}

describe("publiczne polityki RLS", () => {
  const policies = currentPolicies();
  const publicRead = [...policies.entries()].filter(
    ([, p]) => p.table !== "storage.objects" && /for\s+select/.test(p.body) && /\banon\b/.test(p.body),
  );

  it("zostały polityki do sprawdzenia (parser działa)", () => {
    expect(publicRead.map(([k]) => k.split(":")[0]).sort()).toEqual([
      "event_content_sections",
      "polls",
      "rewards",
      "session_speakers",
      "speakers",
    ]);
  });

  it.each(publicRead.map(([k, p]) => [k, p]))("%s pomija usunięte i zawieszone wydarzenia", (_k, p) => {
    const { body } = p as Policy;
    expect(body).toMatch(/deleted_at\s+is\s+null/);
    expect(body).toMatch(/not\s+public\.is_event_suspended_by_id\(events\.id\)/);
  });

  it("tabele z sekretami nie mają publicznej polityki odczytu", () => {
    for (const t of ["events", "sessions", "partners", "quests"]) {
      expect(publicRead.some(([, p]) => p.table === t)).toBe(false);
    }
  });
});
