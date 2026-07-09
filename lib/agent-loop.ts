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
import { loadFeedback } from "../src/feedback";
import { filterSuppressed, recordSurfaced } from "./ledger";

const MODEL = process.env.LITMUS_MODEL || "claude-sonnet-5";
const MAX_TURNS = 12; // hard cap on loop iterations — the demo must never hang

// LITMUS.md carries a why_now block the frozen ScoredSignal doesn't have yet; carry it
// additively so the contract stays untouched. defers_to marks a same-account sibling folded
// into its carrier entry — deferring rows rank below every non-deferring one regardless of score.
export interface AgentScoredSignal extends ScoredSignal {
  why_now?: { trigger: string; what_changed: string; why_buying: string };
  defers_to?: string;
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
- **verify_person** — live FullEnrich lookup. Confirms the PERSON is real: found in FullEnrich at the claimed account. \`real\` > 0.5 requires a verify_person result. It costs credits: triage on icp_fit/urgent from the batch first, then verify only the candidates that could plausibly rank in the top ${topN} (at most ${Math.max(topN * 2, 4)} calls). Skip prospects that are obvious icp_fit zeros. Also skip thin engagement signals (a click, a like, an open) with no corroborating trigger — verification can confirm a person exists, but it cannot turn a non-trigger into a reason to call, so a thin signal deserves no credit. Same for a sibling signal you are folding into a carrier via defers_to — it will not rank, so do not verify it.

Data precedence (HARD RULE): Sillage is fresher than FullEnrich for recent job changes — FullEnrich's index lags. If verify_person finds the person at the claimed account but shows an OLDER title/role than the Sillage signal claims, that is expected lag, NOT a contradiction: Sillage takes precedence on the fresh change, and \`real\` may still be 1.0 (cite both sources in evidence). Kill \`real\` only when the person is not found, has left the account, or the account itself is unverifiable.
Left ≠ lag: index lag always looks like \`is_current_role: true\` at the claimed account with an older title. \`is_current_role: false\` on the verify result means the person LEFT that account — that is the false-positive kill, \`real\` = 0 exactly, never 0.5, no "pending confirmation" hedge. A burned touch on a departed prospect is the one failure this product exists to prevent.
- **emit_ranked** — call EXACTLY ONCE, when triage and verification are done, with an assessment for EVERY prospect in the batch. Unverified prospects: \`real\` capped at 0.5 with an "inconclusive" evidence item. Full drafts are required only for your top ${topN}; lower-ranked prospects may have an empty drafts array. The cut is by composite score, so any prospect you did NOT kill (real > 0 and icp_fit > 0) and did not defer can land in the top ${topN} when the batch is thin — give every such survivor drafts, and let a weak trigger show in the framing ("no urgent trigger yet, so this is a light touch") rather than in a missing draft.

Batch judgment (you are RANKING a batch, not scoring rows in isolation):
- Signals sharing an account are ONE account story. Cross-reference them: pick the single strongest entry to carry the account, set \`defers_to\` = the carrier's signal_id on each sibling, and make the sibling's rank_reason point at it ("second signal on Ramp — Max Freeman's SVP entry carries this account"). Deferring entries need no drafts and are ranked below every non-deferring prospect; corroborating sibling signals should strengthen the carrier's why_now instead.
- rank_reason must be comparative across the batch — say what puts this prospect above or below its neighbors ("edges out the Ramp promo: fresher trigger plus a live warm path"), so the list reads like one rep's decisive ordering.
- The top ${topN} should be diverse accounts, not a monoculture of one.

Honest inference (the rep must be able to defend every line):
- Facts come from three places only: the batch entry, a verify_person result, or CLIENT CONTEXT. Anything else is an inference — phrase it as one ("new RevOps heads typically audit the stack"), never as a fact about THIS prospect, and never build an unverified prospect's why_now on stacked inferences.
- A warm path means suggesting the intro through that person — it never implies the prospect knows the seller's product, and a case study about a company is not a claim about this prospect's own team.
- A thin signal with no corroborated trigger gets the blunt version: say there is no real trigger yet; do not manufacture a narrative around it.

Do not output prose. Work: triage -> verify plausible winners -> emit_ranked.`;
}

// ---------- tools ----------

const VERIFY_TOOL: Anthropic.Tool = {
  name: "verify_person",
  description:
    "Verify a prospect against FullEnrich (live people/lookup): confirms the person exists and is at the claimed account. " +
    "Required for `real` > 0.5. FullEnrich may lag fresh job changes — an older title than the signal claims is expected " +
    "lag, not a contradiction (Sillage takes precedence on the fresh change). Costs credits — call only for prospects that could plausibly rank.",
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
            defers_to: {
              type: "string",
              description:
                "signal_id of the same-account entry that carries this account's story. Set ONLY on a duplicate/sibling signal folded into its carrier; deferring entries are ranked below all non-deferring ones and need no drafts.",
            },
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
export function composite(factors: ScoreFactor[]): number {
  const f = (k: string) => factors.find((x) => x.key === k)?.value ?? 0;
  return Math.round(100 * f("real") * f("icp_fit") * (0.4 + 0.35 * f("urgent") + 0.25 * f("warm")));
}

// ---------- the loop ----------

export interface BatchEntry {
  signal: Signal;
  sillageLead?: EnrichedContact; // Sillage-sourced context (never backs `real`)
  warm: unknown;
}

// Injection points for the offline eval harness (scripts/eval-agent-loop.ts):
// stub verify_person so iterations burn zero FullEnrich credits and stay deterministic.
export interface AgentLoopOptions {
  verify?: (input: Record<string, any>, verified: Map<string, EnrichedContact>) => Promise<string>;
  feedback?: Feedback[];
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

export async function agentLoop(
  entries: BatchEntry[],
  ctx: ClientContext,
  topN: number,
  opts: AgentLoopOptions = {},
): Promise<{ assessments: any[]; verified: Map<string, EnrichedContact> }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = agentSystemPrompt(ctx, opts.feedback ?? loadFeedback(15), entries.length, topN);
  const verified = new Map<string, EnrichedContact>();
  const doVerify = opts.verify ?? runVerify;

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
      max_tokens: 32000, // emit_ranked carries the whole batch — a truncated tool_use arrives with empty input
      system,
      messages,
      tools: [VERIFY_TOOL, EMIT_TOOL],
      ...(forceEmit ? { tool_choice: { type: "tool" as const, name: "emit_ranked" } } : {}),
    });

    const toolUses = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (process.env.LITMUS_DEBUG)
      console.error(
        `[agent-loop] turn ${turn + 1}: stop=${res.stop_reason} tools=[${toolUses.map((t) => `${t.name}(${(t.input as any)?.signal_id ?? ""})`).join(", ")}] in=${res.usage.input_tokens} out=${res.usage.output_tokens}`,
      );
    const emit = toolUses.find((t) => t.name === "emit_ranked");
    if (emit) {
      const out = emit.input as any;
      if (Array.isArray(out?.assessments) && out.assessments.length > 0) {
        return { assessments: out.assessments, verified };
      }
      // truncated/empty emit (e.g. max_tokens hit mid-JSON) — ask for a tighter re-emit instead of returning nothing
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: [
          { type: "tool_result" as const, tool_use_id: emit.id, content: "emit_ranked arrived empty/truncated. Call it again with the full assessments array; keep drafts short and skip drafts outside the top N." },
        ],
      });
      continue;
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
        content: tu.name === "verify_person" ? await doVerify(tu.input as any, verified) : `unknown tool ${tu.name}`,
      })),
    );
    messages.push({ role: "user", content: results });
  }
  return { assessments: [], verified };
}

// ---------- entry point: Sillage detections -> agent loop -> ranked + suppressed + enriched ----------

export async function runSillageAgent(ctx: ClientContext, topN = 5): Promise<AgentScoredSignal[]> {
  // 1. Deterministic fetch: detections + their leads (real payload shape, see data/sillage-samples.json).
  //    The live Sillage feed is intermittent (no stable public API — it returns 0 signals on one
  //    call and real data on the next). If it comes back empty or errors, fall back to the captured
  //    sample payloads so the demo path is deterministic and NEVER empty. Live is a swap-in, never a
  //    hard dependency.
  let data = await listSignals({ page_size: 50 }).then((r) => r?.data).catch(() => undefined);
  let sampleLeads: Map<number, any> | undefined;
  if (!data?.length) {
    const samples = JSON.parse(readFileSync(join(process.cwd(), "data/sillage-samples.json"), "utf8"));
    data = (samples?.list_signals?.data ?? []) as any[];
    const gl = samples?.get_lead?.data;
    sampleLeads = new Map(gl ? [[gl.id, { data: gl }]] : []);
    console.error("[litmus] live Sillage feed empty — using data/sillage-samples.json fallback");
  }
  if (!data?.length) return [];

  const entries: BatchEntry[] = [];
  for (const det of data) {
    const lead = sampleLeads
      ? (det.lead_id ? sampleLeads.get(det.lead_id) ?? null : null)
      : det.lead_id ? await getLead(det.lead_id).catch(() => null) : null;
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
        defers_to: typeof a.defers_to === "string" && a.defers_to ? a.defers_to : undefined,
        factors,
        enriched: verified.get(a.signal_id) ?? entry.sillageLead,
        warm_path: (entry.warm as any) ?? undefined,
        drafts: Array.isArray(a.drafts) ? a.drafts : [],
        evidence: Array.isArray(a.evidence) ? a.evidence : [],
      };
    })
    // deferring siblings sink below every non-deferring prospect — one account, one top-N slot
    .sort((x, y) => (x.defers_to ? 1 : 0) - (y.defers_to ? 1 : 0) || y.score - x.score);

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
