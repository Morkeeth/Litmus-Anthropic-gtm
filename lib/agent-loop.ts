// The agent loop — Flow B upgraded from a fixed workflow to a model-driven loop.
// Sillage detections come in; the model triages the batch against LITMUS.md, decides which
// prospects are worth spending FullEnrich credits on, verifies `real` with the verify_person
// tool (independence rule: Sillage data can never corroborate itself), then emits the ranked
// assessments in one strict emit_ranked call. Composite score is still recomputed in code.
//
// Uses a manual tool-use loop: the pinned @anthropic-ai/sdk (0.32.x) predates the SDK tool
// runner. Same semantics, ~30 lines of plumbing.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Signal, EnrichedContact, ScoredSignal, ScoreFactor, ClientContext, Feedback } from "../src/types";
import { listSignals, getLead } from "../src/sillage";
import { peopleLookup, enrichContacts } from "../src/fullenrich";
import { normalizeSillageDetection, normalizeFullEnrichProfile, mergeFullEnrichContactInfo } from "../src/normalize";
import { lookupRelationship } from "../src/relationship";
import { filterSuppressed, recordSurfaced } from "./ledger";

const MODEL = process.env.LITMUS_MODEL || "claude-sonnet-5";
const MAX_TURNS = 12; // hard cap on loop iterations — the demo must never hang

// LITMUS.md carries a why_now block the frozen ScoredSignal doesn't have yet; carry it
// additively so the contract stays untouched.
export interface AgentScoredSignal extends ScoredSignal {
  why_now?: { trigger: string; what_changed: string; why_buying: string };
}

// ---------- prompt ----------

function agentSystemPrompt(ctx: ClientContext, feedback: Feedback[], batchSize: number, topN: number): string {
  const md = readFileSync(join(process.cwd(), "LITMUS.md"), "utf8");
  const i = md.indexOf("## SYSTEM PROMPT");
  const base = (i >= 0 ? md.slice(i + "## SYSTEM PROMPT".length) : md).trim();
  const fb =
    feedback.map((f) => `- [${f.verdict.toUpperCase()}] ${f.signal_id}${f.reason ? ` — ${f.reason}` : ""}`).join("\n") ||
    "(no feedback yet)";
  const filled = base
    .replaceAll("{{CLIENT_CONTEXT}}", JSON.stringify(ctx, null, 2))
    .replaceAll("{{FEEDBACK_EXAMPLES}}", fb)
    .replaceAll("{{SIGNAL}}", "(batch mode — each prospect's signal is in the user message)")
    .replaceAll("{{ENRICHED_CONTACT}}", "(batch mode — obtain via the verify_person tool)")
    .replaceAll("{{WARM_PATH}}", "(batch mode — per prospect in the user message)")
    .replaceAll("{{CORROBORATION}}", "(none run)");
  return `${filled}

### AGENT MODE — batch triage (overrides the single-prospect framing above)

You receive a BATCH of ${batchSize} prospects as a JSON array in the user message. Each entry has:
\`signal_id\`, \`signal\` (the intent event), \`sillage_lead_context\` (Sillage's own lead data — background ONLY, it can NEVER support the \`real\` factor: verifying a Sillage signal with Sillage data is circular), and \`warm_path\`.

Tools:
- **verify_person** — live FullEnrich lookup. The ONLY evidence that justifies \`real\` > 0.5. It costs credits: triage on icp_fit/urgent from the batch first, then verify only the candidates that could plausibly rank in the top ${topN} (at most ${Math.max(topN * 2, 4)} calls). Skip prospects that are obvious icp_fit zeros.
- **emit_ranked** — call EXACTLY ONCE, when triage and verification are done, with an assessment for EVERY prospect in the batch. Unverified prospects: \`real\` capped at 0.5 with an "inconclusive" evidence item. Full drafts are required only for your top ${topN}; lower-ranked prospects may have an empty drafts array.

Do not output prose. Work: triage -> verify plausible winners -> emit_ranked.`;
}

// ---------- tools ----------

const VERIFY_TOOL: Anthropic.Tool = {
  name: "verify_person",
  description:
    "Verify a prospect against FullEnrich (live people/lookup): confirms whether the person is in the claimed role NOW. " +
    "The only valid source for the `real` factor. Costs credits — call only for prospects that could plausibly rank.",
  input_schema: {
    type: "object",
    properties: {
      signal_id: { type: "string", description: "The batch entry this verification belongs to" },
      person_name: { type: "string" },
      company_domain: { type: "string", description: "e.g. ramp.com — preferred lookup key with person_name" },
      linkedin_url: { type: "string", description: "Alternative lookup key if no domain" },
    },
    required: ["signal_id", "person_name"],
  },
};

const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_ranked",
  description: "Return the final Litmus assessment for every prospect in the batch. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      assessments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            signal_id: { type: "string" },
            rank_reason: { type: "string" },
            why_now: {
              type: "object",
              properties: {
                trigger: { type: "string" },
                what_changed: { type: "string" },
                why_buying: { type: "string" },
              },
              required: ["trigger", "what_changed", "why_buying"],
            },
            factors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", enum: ["real", "icp_fit", "urgent", "warm"] },
                  value: { type: "number" },
                  detail: { type: "string" },
                },
                required: ["key", "value", "detail"],
              },
            },
            drafts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  channel: { type: "string", enum: ["email", "linkedin"] },
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["channel", "body"],
              },
            },
            evidence: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  check: { type: "string" },
                  source: { type: "string" },
                  result: { type: "string" },
                  detail: { type: "string" },
                },
                required: ["check", "source", "result", "detail"],
              },
            },
          },
          required: ["signal_id", "rank_reason", "why_now", "factors", "drafts", "evidence"],
        },
      },
    },
    required: ["assessments"],
  },
};

// LITMUS.md formula (authoritative): base = 100*real*icp_fit ; score = base*(0.4 + 0.35*urgent + 0.25*warm)
function composite(factors: ScoreFactor[]): number {
  const f = (k: string) => factors.find((x) => x.key === k)?.value ?? 0;
  return Math.round(100 * f("real") * f("icp_fit") * (0.4 + 0.35 * f("urgent") + 0.25 * f("warm")));
}

// ---------- the loop ----------

interface BatchEntry {
  signal: Signal;
  sillageLead?: EnrichedContact; // Sillage-sourced context (never backs `real`)
  warm: unknown;
}

async function runVerify(input: Record<string, any>, verified: Map<string, EnrichedContact>): Promise<string> {
  try {
    const res = await peopleLookup({
      person_name: input.person_name,
      ...(input.company_domain ? { company_domain: input.company_domain } : {}),
      ...(input.linkedin_url ? { person_professional_network_url: input.linkedin_url } : {}),
    });
    if (!res?.people?.length) return JSON.stringify({ found: false, note: "no FullEnrich match — treat real as unverifiable" });
    const contact = normalizeFullEnrichProfile(res);
    if (input.signal_id) verified.set(String(input.signal_id), contact);
    const { raw: _raw, ...canonical } = contact; // canonical shape only — raw vendor JSON never reaches the model
    return JSON.stringify({ found: true, contact: canonical });
  } catch (e: any) {
    return JSON.stringify({ found: false, error: String(e?.message ?? e) });
  }
}

async function agentLoop(
  entries: BatchEntry[],
  ctx: ClientContext,
  topN: number,
): Promise<{ assessments: any[]; verified: Map<string, EnrichedContact> }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = agentSystemPrompt(ctx, [], entries.length, topN);
  const verified = new Map<string, EnrichedContact>();

  const batch = entries.map((e) => ({
    signal_id: e.signal.signal_id,
    signal: { ...e.signal, raw: undefined }, // canonical only
    sillage_lead_context: e.sillageLead ? { ...e.sillageLead, raw: undefined } : null,
    warm_path: e.warm ?? null,
  }));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Prospect batch:\n${JSON.stringify(batch)}\n\nTriage, verify plausible winners, then emit_ranked.` },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const forceEmit = turn === MAX_TURNS - 1;
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages,
      tools: [VERIFY_TOOL, EMIT_TOOL],
      ...(forceEmit ? { tool_choice: { type: "tool" as const, name: "emit_ranked" } } : {}),
    });

    const toolUses = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    const emit = toolUses.find((t) => t.name === "emit_ranked");
    if (emit) {
      const out = emit.input as any;
      return { assessments: Array.isArray(out?.assessments) ? out.assessments : [], verified };
    }
    if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
      // model stopped talking instead of emitting — force the terminal tool next turn
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: "Call emit_ranked now with your assessments for every prospect." });
      continue;
    }

    messages.push({ role: "assistant", content: res.content });
    const results = await Promise.all(
      toolUses.map(async (tu) => ({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: tu.name === "verify_person" ? await runVerify(tu.input as any, verified) : `unknown tool ${tu.name}`,
      })),
    );
    messages.push({ role: "user", content: results });
  }
  return { assessments: [], verified };
}

// ---------- entry point: Sillage detections -> agent loop -> ranked + suppressed + enriched ----------

export async function runSillageAgent(ctx: ClientContext, topN = 5): Promise<AgentScoredSignal[]> {
  // 1. Deterministic fetch: detections + their leads (real payload shape, see data/sillage-samples.json).
  const { data } = await listSignals({ page_size: 50 });
  if (!data?.length) return [];

  const entries: BatchEntry[] = [];
  for (const det of data) {
    const lead = det.lead_id ? await getLead(det.lead_id).catch(() => null) : null;
    const signal = normalizeSillageDetection(det, lead);
    const l = lead?.data ?? {};
    const sillageLead: EnrichedContact | undefined = lead
      ? {
          full_name: signal.contact.full_name,
          title: l.position ?? undefined,
          company: { name: l.company?.name ?? undefined, domain: l.company?.domain ?? undefined },
          linkedin_url: l.linkedin_url ?? undefined,
        }
      : undefined;
    entries.push({ signal, sillageLead, warm: lookupRelationship(signal.contact.full_name, signal.account.name) });
  }

  // 2. The agent loop: triage -> selective FullEnrich verification -> emit.
  const { assessments, verified } = await agentLoop(entries, ctx, topN);
  const bySignalId = new Map(entries.map((e) => [e.signal.signal_id, e]));

  const scored: AgentScoredSignal[] = assessments
    .filter((a) => bySignalId.has(a.signal_id))
    .map((a) => {
      const entry = bySignalId.get(a.signal_id)!;
      const factors = (Array.isArray(a.factors) ? a.factors : []) as ScoreFactor[];
      return {
        signal_id: a.signal_id,
        score: composite(factors),
        rank_reason: a.rank_reason ?? "",
        why_now: a.why_now,
        factors,
        enriched: verified.get(a.signal_id) ?? entry.sillageLead,
        warm_path: (entry.warm as any) ?? undefined,
        drafts: Array.isArray(a.drafts) ? a.drafts : [],
        evidence: Array.isArray(a.evidence) ? a.evidence : [],
      };
    })
    .sort((x, y) => y.score - x.score);

  // 3. Same downstream discipline as every flow: suppression ledger, top N, record.
  const kept = filterSuppressed(scored).slice(0, topN) as AgentScoredSignal[];
  recordSurfaced(kept);

  // 4. Best-effort email/phone for the winners (slow leg stays off the score path).
  try {
    const targets = kept.filter((r) => r.enriched?.full_name);
    if (targets.length) {
      const bulk = await enrichContacts(
        "litmus-agent",
        targets.map((r) => {
          const [first, ...rest] = (r.enriched!.full_name ?? "").split(" ");
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
      for (const r of kept) {
        const hit = byId.get(r.signal_id);
        if (hit && r.enriched) r.enriched = mergeFullEnrichContactInfo(r.enriched, { data: [hit] });
      }
    }
  } catch {
    // enrichment is best-effort — the ranked score stands without it
  }

  return kept;
}
