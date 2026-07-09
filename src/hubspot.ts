// HubSpot client — private-app token (REST). EU or US: base is always api.hubapi.com.
// Two uses: SOURCE (read contacts -> score) and OUTPUT (write scores back — guarded).
// Env: HUBSPOT_TOKEN (pat-...). Writes require HUBSPOT_WRITE_ARMED=1.

const BASE = "https://api.hubapi.com";
function headers() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
}
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`HubSpot ${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json as T;
}

// ---------- Read (source) ----------
export async function listContacts(limit = 50): Promise<any[]> {
  const props = "firstname,lastname,email,jobtitle,company,website";
  const j = await call<{ results: any[] }>("GET", `/crm/v3/objects/contacts?limit=${limit}&properties=${props}`);
  return j.results ?? [];
}
export async function searchContactByEmail(email: string): Promise<any | null> {
  const j = await call<{ results: any[] }>("POST", `/crm/v3/objects/contacts/search`, {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email", "firstname", "lastname", "jobtitle", "company"],
    limit: 1,
  });
  return j.results?.[0] ?? null;
}

// ---------- Write (output — guarded) ----------
// Ensure our custom properties exist (idempotent — ignores "already exists").
export async function ensureLitmusProperties(): Promise<void> {
  const defs = [
    { name: "litmus_score", label: "Litmus Score", type: "number", fieldType: "number" },
    { name: "litmus_reason", label: "Litmus Reason", type: "string", fieldType: "textarea" },
    { name: "litmus_why_now", label: "Litmus Why Now", type: "string", fieldType: "textarea" },
  ];
  for (const d of defs) {
    try {
      await call("POST", `/crm/v3/properties/contacts`, { ...d, groupName: "contactinformation" });
    } catch (e: any) {
      if (!String(e.message).includes("already exists") && !String(e.message).includes("409")) throw e;
    }
  }
}
export async function patchContact(id: string, properties: Record<string, string>): Promise<void> {
  await call("PATCH", `/crm/v3/objects/contacts/${id}`, { properties });
}
