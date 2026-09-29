// Server-only module — VERCEL_API_TOKEN nigdy nie trafia do klienta.
// Wywołania tylko z server actions / route handlerów.

const BASE = "https://api.vercel.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function teamQuery() {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `?teamId=${teamId}` : "";
}

function projectPath(suffix = "") {
  const projectId = process.env.VERCEL_PROJECT_ID;
  return `/v10/projects/${projectId}${suffix}${teamQuery()}`;
}

function projectPathV9(suffix = "") {
  const projectId = process.env.VERCEL_PROJECT_ID;
  return `/v9/projects/${projectId}${suffix}${teamQuery()}`;
}

export type DomainResult = { ok: true; alreadyExists?: true } | { ok: false; error: string };
export type DomainStatus = { verified: boolean; name: string } | null;

/** Rejestruje domenę w projekcie Vercel. Idempotentna — domain_already_in_use → ok. */
export async function addDomain(host: string): Promise<DomainResult> {
  if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return { ok: false, error: "Vercel API not configured" };
  }
  try {
    const res = await fetch(`${BASE}${projectPath("/domains")}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: host }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    // 409 z tym samym projektem = domena już jest → sukces
    if (
      res.status === 409 &&
      (body?.error?.code === "domain_already_in_use" ||
        body?.error?.code === "domain_conflict")
    ) {
      return { ok: true, alreadyExists: true };
    }
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    console.error(`[vercel-domains] addDomain(${host}) failed: ${msg}`);
    return { ok: false, error: msg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vercel-domains] addDomain(${host}) threw: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** Odpina domenę z projektu. Brak domeny (404) → ok. */
export async function removeDomain(host: string): Promise<DomainResult> {
  if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return { ok: false, error: "Vercel API not configured" };
  }
  try {
    const suffix = `/domains/${encodeURIComponent(host)}`;
    const res = await fetch(`${BASE}${projectPathV9(suffix)}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (res.ok || res.status === 404) return { ok: true };
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    console.error(`[vercel-domains] removeDomain(${host}) failed: ${msg}`);
    return { ok: false, error: msg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vercel-domains] removeDomain(${host}) threw: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** Pobiera status domeny. Zwraca null przy błędzie lub braku konfiguracji. */
export async function getDomainStatus(host: string): Promise<DomainStatus> {
  if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return null;
  }
  try {
    const suffix = `/domains/${encodeURIComponent(host)}`;
    const res = await fetch(`${BASE}${projectPathV9(suffix)}`, {
      headers: headers(),
      // Nie cachujemy statusu — odpytujemy na żywo przy wejściu w panel.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (!body?.name) return null;
    return { name: body.name, verified: body.verified === true };
  } catch {
    return null;
  }
}
