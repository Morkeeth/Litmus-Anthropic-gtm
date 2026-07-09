// The live workflow. Flow A (FullEnrich-sourced): ICP -> people/search -> score -> rank -> enrich winners.
// Runs on a FullEnrich key + an Anthropic key. No Sillage needed to start.

import Anthropic from "@anthropic-ai/sdk";
import type { Signal, EnrichedContact, ScoredSignal, ClientContext } from "../src/types";
import { peopleSearch, enrichContacts } from "../src/fullenrich";
import { normalizeFullEnrichProfile, mergeFullEnrichContactInfo } from "../src/normalize";
import { scoreAndRank, type ScoreInput } from "../src/score";

const MODEL = process.env.LITMUS_MODEL || "claude-fable-5";

// Turn the freeform ICP into FullEnrich people/search filters (an AI-depth step).
// Filter objects are { value, exact_match?, exclude? }. Falls back to a broad title search.
async function deriveFilters(ctx: ClientContext): Promise<Record<string, unknown>> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        "Convert this seller's ICP into FullEnrich people/search filters. Return arrays of {value} objects. " +
        "Keys you may use: current_position_titles, current_position_seniority_level, current_company_industries, " +
        "current_company_headcounts ({min,max}), person_locations. Only include what the ICP clearly implies.",
      messages: [{ role: "user", content: JSON.stringify(ctx) }],
      tools: [
        {
          name: "emit_filters",
          description: "FullEnrich people/search filters",
          input_schema: { type: "object", properties: {}, additionalProperties: true },
        },
      ],
      tool_choice: { type: "tool", name: "emit_filters" },
    });
    const tu = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    const f = (tu?.input ?? {}) as Record<string, unknown>;
    return Object.keys(f).length ? f : { current_position_titles: [{ value: "VP Sales" }] };
  } catch {
    return { current_position_titles: [{ value: "VP Sales" }] };
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

export async function runIcpWorkflow(ctx: ClientContext, topN = 7): Promise<ScoredSignal[]> {
  // 1. FullEnrich as the database: search people by ICP.
  const filters = await deriveFilters(ctx);
  const { people } = await peopleSearch({ ...filters, limit: Math.max(topN * 2, 10) });

  // 2. Score every candidate (profile is enough for real/icp_fit/urgent).
  const inputs: ScoreInput[] = people.map((p: any) => ({
    signal: profileToSignal(p),
    enriched: normalizeFullEnrichProfile({ people: [p] }),
  }));
  const ranked = await scoreAndRank(inputs, { clientContext: ctx, topN });

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
