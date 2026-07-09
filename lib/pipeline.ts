// The live workflow. Flow A (FullEnrich-sourced): ICP -> people/search -> score -> rank -> enrich winners.
// Runs on a FullEnrich key + an Anthropic key. No Sillage needed to start.

import Anthropic from "@anthropic-ai/sdk";
import type { Signal, EnrichedContact, ScoredSignal, ClientContext } from "../src/types";
import { peopleSearch, enrichContacts, reverseEmail } from "../src/fullenrich";
import { normalizeFullEnrichProfile, mergeFullEnrichContactInfo } from "../src/normalize";
import { scoreAll, type ScoreInput } from "../src/score";
import { filterSuppressed, recordSurfaced } from "./ledger";
import { loadFeedback } from "../src/feedback";

// Score -> drop already-surfaced (cooldown) -> top N -> log the surfaced set. The dedup gate.
// Feeds recent 👍/👎 feedback back into the scorer as few-shot — the learning loop.
async function rankSuppress(inputs: ScoreInput[], ctx: ClientContext, topN: number): Promise<ScoredSignal[]> {
  const scored = await scoreAll(inputs, { clientContext: ctx, topN, feedbackExamples: loadFeedback(15) });
  const kept = filterSuppressed(scored).slice(0, topN);
  recordSurfaced(kept);
  return kept;
}

const MODEL = process.env.LITMUS_MODEL || "claude-sonnet-5";

// Turn the freeform ICP into FullEnrich people/search filters (an AI-depth step).
// Filter objects are { value, exact_match?, exclude? }. We ONLY use enum-free filters
// (titles/locations/company-names are free text; headcounts is {min,max}) to avoid
// error.filters.enum.invalid from seniority/industry enums. Falls back to a broad title search.
const SAFE_FILTER_KEYS = new Set([
  "current_position_titles",
  "person_locations",
  "current_company_names",
  "current_company_headcounts",
]);
const FALLBACK_FILTERS = { current_position_titles: [{ value: "VP Sales" }] };

async function deriveFilters(ctx: ClientContext): Promise<Record<string, unknown>> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        "Convert this seller's ICP into FullEnrich people/search filters. Use ONLY these keys: " +
        "current_position_titles (array of {value}, free text job titles), person_locations (array of {value}), " +
        "current_company_names (array of {value}), current_company_headcounts (array of {min,max}). " +
        "Do NOT use seniority or industry. Only include what the ICP clearly implies.",
      messages: [{ role: "user", content: JSON.stringify(ctx) }],
      tools: [
        {
          name: "emit_filters",
          description: "FullEnrich people/search filters (enum-free keys only)",
          input_schema: { type: "object", properties: {}, additionalProperties: true },
        },
      ],
      tool_choice: { type: "tool", name: "emit_filters" },
    });
    const tu = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    const raw = (tu?.input ?? {}) as Record<string, unknown>;
    // whitelist: drop anything with an enum constraint even if the model returned it
    const f: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) if (SAFE_FILTER_KEYS.has(k)) f[k] = v;
    return Object.keys(f).length ? f : FALLBACK_FILTERS;
  } catch {
    return FALLBACK_FILTERS;
  }
}

// FullEnrich person profile -> canonical Signal (an ICP-match "signal", no intent event).
function profileToSignal(p: any): Signal {
  const cur = p?.employment?.current ?? {};
  return {
    signal_id: `fe_${p?.id ?? p?.full_name}`,
    agent: "account_based_signals",
    type: "icp_match",
    category: "web",
    account: { name: cur?.company?.name ?? "", domain: cur?.company?.domain, icp_match: true },
    contact: {
      full_name: p?.full_name,
      role: cur?.title,
      linkedin_url: p?.social_profiles?.professional_network?.url,
    },
    summary: `ICP match: ${cur?.title ?? "role"} at ${cur?.company?.name ?? "company"}`,
    detected_at: new Date().toISOString(),
    raw: p,
  };
}

export async function runIcpWorkflow(ctx: ClientContext, topN = 7, targetCompanies?: string[]): Promise<ScoredSignal[]> {
  // 1. FullEnrich as the database: search people by ICP.
  const filters = await deriveFilters(ctx);
  // Scoping to named target accounts yields in-ICP people (high icp_fit) instead of random-industry VPs.
  if (targetCompanies?.length) filters.current_company_names = targetCompanies.map((v) => ({ value: v }));
  const { people } = await peopleSearch({ ...filters, limit: Math.max(topN * 2, 10) });

  // 2. Score every candidate (profile is enough for real/icp_fit/warm).
  const inputs: ScoreInput[] = people.map((p: any) => ({
    signal: profileToSignal(p),
    enriched: normalizeFullEnrichProfile({ people: [p] }),
  }));
  const ranked = await rankSuppress(inputs, ctx, topN);

  // 3. Enrich the winners for email/phone (best-effort; the slow leg stays off the score path).
  try {
    const bulk = await enrichContacts(
      "litmus-live",
      ranked.map((r) => {
        const [first, ...rest] = (r.enriched?.full_name ?? "").split(" ");
        return {
          first_name: first,
          last_name: rest.join(" "),
          domain: r.enriched?.company?.domain,
          company_name: r.enriched?.company?.name,
          enrich_fields: ["contact.work_emails", "contact.phones"] as const,
          custom: { signal_id: r.signal_id },
        };
      }),
      { timeoutMs: 45_000, intervalMs: 8_000 },
    );
    const byId = new Map<string, any>();
    for (const d of bulk?.data ?? []) byId.set(d?.custom?.signal_id, d);
    for (const r of ranked) {
      const hit = byId.get(r.signal_id);
      if (hit && r.enriched) r.enriched = mergeFullEnrichContactInfo(r.enriched, { data: [hit] });
    }
  } catch {
    // enrichment is best-effort — the ranked score stands without it
  }

  return ranked;
}

// ---------- Source-optional flows (Litmus works without FullEnrich search / without Sillage) ----------

// Flow C: CRM / CSV contacts you already have. No FullEnrich search, no Sillage. Pure ICP scoring.
export async function runFromContacts(
  ctx: ClientContext,
  contacts: Array<{ full_name: string; title?: string; company?: string; domain?: string; email?: string }>,
  topN = 7,
): Promise<ScoredSignal[]> {
  const inputs: ScoreInput[] = contacts.map((c, i) => ({
    signal: {
      signal_id: `crm_${i}`,
      agent: "account_based_signals",
      type: "crm_contact",
      category: "first_party",
      account: { name: c.company ?? "", domain: c.domain, icp_match: true },
      contact: { full_name: c.full_name, role: c.title },
      summary: `CRM contact: ${c.title ?? "role"} at ${c.company ?? "company"}`,
      detected_at: new Date().toISOString(),
    } as Signal,
    enriched: {
      full_name: c.full_name,
      title: c.title,
      is_current_role: true,
      company: { name: c.company, domain: c.domain },
      work_email: c.email ? { email: c.email, status: "UNVERIFIED" } : undefined,
    } as EnrichedContact,
  }));
  return rankSuppress(inputs, ctx, topN);
}

// Flow B: Sillage intent detections. Pull signals -> get_lead per detection -> score (with real intent).
// Optionally FullEnrich-enrich the top leads for email/phone. Needs a Sillage key; enrich needs FullEnrich.
export async function runFromSillage(ctx: ClientContext, topN = 7): Promise<ScoredSignal[]> {
  const { listSignals, getLead } = await import("../src/sillage");
  const { data } = await listSignals({ page_size: 50 });
  const inputs: ScoreInput[] = [];
  for (const det of data) {
    const lead = det.lead_id ? await getLead(det.lead_id).catch(() => null) : null;
    const l = lead?.data ?? lead ?? {};
    const signal: Signal = {
      signal_id: `sil_${det.id}`,
      agent: (det.agent_type ?? "keyword_detection") as any,
      type: det.signal_type ?? det.agent_type ?? "signal",
      category: "social",
      account: { name: l.company?.name ?? det.account_name ?? "", domain: l.company?.domain, icp_match: true },
      contact: { full_name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.headline || "", role: l.position, linkedin_url: l.linkedin_url },
      summary: det.summary ?? det.text ?? `${det.signal_type ?? "signal"} on ${l.company?.name ?? "account"}`,
      detected_at: det.detected_at ?? det.created_at ?? new Date().toISOString(),
      raw: det,
    };
    const enriched: EnrichedContact | undefined = lead
      ? { full_name: signal.contact.full_name, title: l.position, is_current_role: true, company: { name: l.company?.name, domain: l.company?.domain }, linkedin_url: l.linkedin_url }
      : undefined;
    inputs.push({ signal, enriched });
  }
  return rankSuppress(inputs, ctx, topN);
}

// Flow E: HubSpot contacts as the source (read-only). Score your existing CRM database.
export async function runFromHubspot(ctx: ClientContext, topN = 7): Promise<ScoredSignal[]> {
  const { listContacts } = await import("../src/hubspot");
  const contacts = await listContacts(50);
  const inputs: ScoreInput[] = contacts.map((c: any) => {
    const p = c.properties ?? {};
    const full = [p.firstname, p.lastname].filter(Boolean).join(" ") || p.email || "Contact";
    return {
      signal: {
        signal_id: `hs_${c.id}`,
        agent: "account_based_signals",
        type: "crm_contact",
        category: "first_party",
        account: { name: p.company ?? "", domain: p.website, icp_match: true },
        contact: { full_name: full, role: p.jobtitle },
        summary: `HubSpot contact: ${p.jobtitle ?? "role"} at ${p.company ?? "company"}`,
        detected_at: new Date().toISOString(),
        raw: c,
      } as Signal,
      enriched: {
        full_name: full,
        title: p.jobtitle,
        is_current_role: true,
        company: { name: p.company },
        work_email: p.email ? { email: p.email, status: "UNVERIFIED" } : undefined,
      } as EnrichedContact,
    };
  });
  return rankSuppress(inputs, ctx, topN);
}

// Flow D: a list of emails (webinar, export). FullEnrich reverse-lookup -> full profile -> score.
// Showcases FullEnrich's reverse-email feature. Needs a FullEnrich key.
export async function runFromEmails(ctx: ClientContext, emails: string[], topN = 7): Promise<ScoredSignal[]> {
  const inputs: ScoreInput[] = [];
  for (const email of emails) {
    try {
      const res = await reverseEmail(email);
      const profile = res?.data?.[0]?.profile;
      if (!profile) continue;
      const enriched = normalizeFullEnrichProfile({ people: [profile] });
      inputs.push({ signal: profileToSignal(profile), enriched });
    } catch {
      // skip unresolvable emails
    }
  }
  return rankSuppress(inputs, ctx, topN);
}
