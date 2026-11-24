import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMIT_KEYS, FEATURE_KEYS } from "../entitlements-core";

// Statyczna kontrola migracji egzekwującej limity planu w bazie (druga warstwa obok
// server actions). Zachowanie SQL sprawdzone na Postgresie; tu pilnujemy kontraktu.

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261124140000_plan_limits_db_enforcement.sql"),
  "utf8",
)
  .replace(/--[^\n]*/g, "")
  .toLowerCase();

function fnBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `brak funkcji ${name}`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end);
}

describe("migracja: limity planu w bazie", () => {
  it("przełącznik domyślnie wyłączony (pilotaż bez limitów jak BILLING_ENABLED != true)", () => {
    expect(sql).toMatch(/enforce_plan_limits\s+boolean\s+not\s+null\s+default\s+false/);
    expect(sql).toMatch(/alter table public\.billing_settings enable row level security/);
    // Bez polityk — tabela dostępna wyłącznie dla service_role.
    expect(sql).not.toMatch(/create\s+policy/);
  });

  it("egzekwuje tylko dla roli authenticated (service_role i SQL bez JWT pominięte)", () => {
    const body = fnBody("plan_limits_enforced");
    expect(body).toContain("request.jwt.claim.role");
    expect(body).toContain("request.jwt.claims");
    expect(body).toMatch(/is distinct from 'authenticated'/);
  });

  it("triggery wywołują sprawdzenie roli/przełącznika przed liczeniem", () => {
    for (const fn of ["enforce_event_plan_limits", "enforce_attendee_plan_limit"]) {
      const body = fnBody(fn);
      const guard = body.indexOf("public.plan_limits_enforced()");
      expect(guard).toBeGreaterThan(0);
      expect(guard).toBeLessThan(body.indexOf("count(*)"));
    }
  });

  it("plan efektywny = wyższy z override'u i żywej subskrypcji, inaczej free", () => {
    const body = fnBody("org_entitlement_sources");
    expect(body).toMatch(/s\.status in \('trialing', 'active', 'past_due'\)/);
    expect(body).toMatch(/v_ovp_sort > v_sub_sort/);
    expect(body).toMatch(/expires_at is null or o\.expires_at > now\(\)/);
    expect(body).toMatch(/p\.key = 'free'/);
  });

  it("używa kluczy limitów i funkcji znanych aplikacji", () => {
    const limits = [...sql.matchAll(/org_plan_limit\([^,]+,\s*'([a-z_]+)'\)/g)].map((m) => m[1]);
    const features = [...sql.matchAll(/org_plan_feature\([^,]+,\s*'([a-z_]+)'\)/g)].map((m) => m[1]);
    expect(new Set(limits)).toEqual(new Set(["max_events", "max_attendees_per_event"]));
    expect(new Set(features)).toEqual(new Set(["gamification", "gamification_rewards"]));
    for (const l of limits) expect(LIMIT_KEYS).toContain(l);
    for (const f of features) expect(FEATURE_KEYS).toContain(f);
  });

  it("max_events liczy aktywne wydarzenia tak jak createEvent", () => {
    const body = fnBody("enforce_event_plan_limits");
    expect(body).toMatch(/e\.deleted_at is null/);
    expect(body).toMatch(/e\.status in \('draft', 'published', 'live'\)/);
    // Tylko przejście do stanu aktywnego (utworzenie / przywrócenie) — istniejące dane bez zmian.
    expect(body).toMatch(/v_new_active and not v_was_active/);
    // Bramki funkcji tylko przy włączaniu.
    expect(body).toMatch(/not old\.gamification_enabled/);
    expect(body).toMatch(/old\.lottery_points_per_ticket is null/);
  });

  it("limit uczestników nie liczy odrzuconych i reaguje tylko na ich przywrócenie/przeniesienie", () => {
    const body = fnBody("enforce_attendee_plan_limit");
    expect(body).toMatch(/a\.status <> 'rejected'/);
    expect(body).toMatch(/old\.status <> 'rejected' and old\.event_id = new\.event_id/);
  });

  it("triggery podpięte, funkcje niedostępne jako RPC", () => {
    expect(sql).toMatch(/create trigger enforce_event_plan_limits\s+before insert or update of[^;]+on public\.events/);
    expect(sql).toMatch(/create trigger enforce_attendee_plan_limit\s+before insert or update of status, event_id\s+on public\.attendees/);
    for (const fn of [
      "plan_limits_enforced()",
      "org_entitlement_sources(uuid)",
      "org_plan_feature(uuid, text)",
      "org_plan_limit(uuid, text)",
      "enforce_event_plan_limits()",
      "enforce_attendee_plan_limit()",
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
    }
    // Każda funkcja SECURITY DEFINER ma przypięty search_path.
    const definers = sql.match(/security definer\s+set search_path = public, pg_temp/g) ?? [];
    expect(definers.length).toBe((sql.match(/security definer/g) ?? []).length);
  });
});
