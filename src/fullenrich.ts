// FullEnrich client — verified against https://docs.fullenrich.com (Jul 9).
// Base: https://app.fullenrich.com/api/v2   Auth: `Authorization: Bearer <key>`
//
// Key facts (from the official docs, not guessed):
// - Search/Lookup are SYNCHRONOUS but return PROFILES ONLY (no email/phone).
// - Emails/phones come ONLY from the async waterfall: POST /contact/enrich/bulk
//   (max 100/batch) then poll GET /contact/enrich/bulk/{id}. 30-90s typical.
//   While running, poll returns HTTP 400 code "error.enrichment.in_progress".
//   `?forceResults=true` returns partials early.
// - Rate limit: 60 calls/min across ALL endpoints.
// - Credits: search/lookup 0.25 per result; work email 1; phone 10. Charged only on hit.
// - Free test contact (0 credits): Grégoire Démogé @ fullenrich.com — use for integration tests.

const BASE = "https://app.fullenrich.com/api/v2";

function headers() {
  return {
    Authorization: `Bearer ${process.env.FULLENRICH_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`FullEnrich ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const code = json?.code ?? json?.error ?? "";
    const err = new Error(`FullEnrich ${method} ${path} -> ${res.status} ${code}`);
    (err as any).status = res.status;
    (err as any).code = code;
    throw err;
  }
  return json as T;
}

// ---------- Sync: truth-axis primitives ----------

// GET /account/credits -> { balance }. Log at startup — a shared key can dry up.
export async function getCredits(): Promise<{ balance: number }> {
  return call("GET", "/account/credits");
}

// POST /company/lookup — by domain or LinkedIn URL. 0.25 credits/result.
export async function companyLookup(q: { domain?: string; professional_network_url?: string }) {
  return call<{ companies: any[]; metadata: { credits: number } }>("POST", "/company/lookup", q);
}

// POST /company/search — filter objects are { value, exact_match?, exclude? }.
export async function companySearch(filters: Record<string, unknown>) {
  return call<{ companies: any[]; metadata: { total: number; credits: number } }>(
    "POST",
    "/company/search",
    { limit: 5, offset: 0, ...filters },
  );
}

// POST /people/lookup — the core "is this person really there NOW" check.
// By name + company domain, or by LinkedIn URL. Response profile carries
// employment.current { title, is_current, start_at, company: { name, domain } }.
export async function peopleLookup(q: {
  person_name?: string;
  company_domain?: string;
  person_professional_network_url?: string;
}) {
  return call<{ people: any[]; metadata: { credits: number } }>("POST", "/people/lookup", q);
}

// POST /people/search — richer filters: current_company_names, current_position_titles,
// current_position_seniority_level, past_company_names, current_company_days_since_last_job_change...
export async function peopleSearch(filters: Record<string, unknown>) {
  return call<{ people: any[]; metadata: { total: number; credits: number } }>(
    "POST",
    "/people/search",
    { limit: 5, offset: 0, ...filters },
  );
}

// ---------- Async: contact info (email/phone) via the waterfall ----------

export interface EnrichInput {
  first_name?: string;
  last_name?: string;
  domain?: string;
  company_name?: string;
  linkedin_url?: string;
  enrich_fields?: Array<"contact.work_emails" | "contact.phones" | "contact.personal_emails">;
  custom?: Record<string, string>; // echoed back in results — use to correlate (max 10 keys)
}

async function pollBulk(pathBase: string, enrichmentId: string, timeoutMs: number, intervalMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await call<any>("GET", `${pathBase}/${enrichmentId}?forceResults=true`);
      if (res.status === "FINISHED" || Date.now() > deadline) return res;
    } catch (e: any) {
      if (e.code !== "error.enrichment.in_progress") throw e;
      if (Date.now() > deadline) throw new Error(`${pathBase}/${enrichmentId} timed out`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Submit + poll wrapped so the agent sees one sync-looking call.
export async function enrichContacts(
  name: string,
  data: EnrichInput[],
  { timeoutMs = 120_000, intervalMs = 10_000 } = {},
): Promise<any> {
  const { enrichment_id } = await call<{ enrichment_id: string }>(
    "POST",
    "/contact/enrich/bulk",
    { name, data },
  );
  return pollBulk("/contact/enrich/bulk", enrichment_id, timeoutMs, intervalMs);
}

// ---------- Async: reverse email lookup (who is actually behind this address) ----------
// 1 credit per match. Depth beat: a signal hands us an email, we prove who it belongs to.

export async function reverseEmail(
  email: string,
  { timeoutMs = 120_000, intervalMs = 10_000 } = {},
) {
  const { enrichment_id } = await call<{ enrichment_id: string }>(
    "POST",
    "/contact/reverse/email/bulk",
    { name: `reverse-${email}`, data: [{ email }] },
  );
  return pollBulk("/contact/reverse/email/bulk", enrichment_id, timeoutMs, intervalMs);
}
