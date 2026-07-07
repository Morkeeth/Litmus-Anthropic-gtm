// FullEnrich client. Base: https://app.fullenrich.com/api/v2  Auth: Bearer.
// Prefer the SYNC search endpoints for the verify path (no webhook/polling).
// TODO Thursday: implement against real key, confirm response shapes.

const BASE = "https://app.fullenrich.com/api/v2";

function headers() {
  return {
    Authorization: `Bearer ${process.env.FULLENRICH_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// Sync. Does this company exist / is it reachable.
export async function searchCompany(nameOrDomain: string): Promise<unknown> {
  // POST /company/search
  throw new Error("TODO: implement searchCompany");
}

// Sync. Find a person in a company + role.
export async function searchPeople(company: string, role?: string): Promise<unknown> {
  // POST /people/search
  throw new Error("TODO: implement searchPeople");
}

// Async in the API. Wrap the poll inside so the agent sees it as sync.
export async function enrichContact(person: unknown): Promise<unknown> {
  // POST /contact/enrich/bulk -> poll GET /contact/enrich/bulk/{id} every 5-10s
  throw new Error("TODO: implement enrichContact");
}

// Guardrail: log at startup, a shared hackathon key can dry up.
export async function getCredits(): Promise<unknown> {
  // GET /account/credits
  throw new Error("TODO: implement getCredits");
}
