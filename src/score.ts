// The Litmus scoring engine — THE PRODUCT. Loads LITMUS.md, calls Anthropic, returns a
// ScoredSignal. Operates only on canonical types (normalize.ts). The composite score is
// RE-COMPUTED in code from the model's factor values, so it always matches LITMUS.md's
// stated formula — auditable, not vibes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { Signal, EnrichedContact, ScoredSignal, ClientContext, Feedback, ScoreFactor } from "./types";
import { lookupRelationship } from "./relationship";

export interface ScoreInput {
  signal: Signal;
  enriched?: EnrichedContact;
  accountContext?: string;
}
export interface ScoreConfig {
  clientContext: ClientContext;
  feedbackExamples?: Feedback[];
  topN?: number;
}

const MODEL = process.env.LITMUS_MODEL || "claude-fable-5";

function prompt(): string {
  // LITMUS.md holds the "## SYSTEM PROMPT" section; everything under that heading is the prompt.
  const md = readFileSync(join(process.cwd(), "LITMUS.md"), "utf8");
  const i = md.indexOf("## SYSTEM PROMPT");
  return i >= 0 ? md.slice(i + "## SYSTEM PROMPT".length).trim() : md;
}

function fill(tpl: string, cfg: ScoreConfig, input: ScoreInput, warm: unknown): string {
  const feedback = (cfg.feedbackExamples ?? [])
    .map((f) => `- [${f.verdict.toUpperCase()}] ${f.signal_id}${f.reason ? ` — ${f.reason}` : ""}`)
    .join("\n") || "(no feedback yet)";
  return tpl
    .replaceAll("{{CLIENT_CONTEXT}}", JSON.stringify(cfg.clientContext, null, 2))
    .replaceAll("{{SIGNAL}}", JSON.stringify(input.signal))
    .replaceAll("{{ENRICHED_CONTACT}}", JSON.stringify(input.enriched ?? null))
    .replaceAll("{{WARM_PATH}}", JSON.stringify(warm ?? null))
    .replaceAll("{{CORROBORATION}}", input.accountContext ?? "(none run)")
    .replaceAll("{{FEEDBACK_EXAMPLES}}", feedback);
}

// The forced structured output. Model returns factors + reason + drafts + evidence; we compute score.
const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_score",
  description: "Return the Litmus assessment for this prospect.",
  input_schema: {
    type: "object",
    properties: {
      rank_reason: { type: "string" },
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
    required: ["rank_reason", "factors", "drafts", "evidence"],
  },
};

// LITMUS.md formula: base = 100*real*icp_fit ; score = base*(0.6 + 0.25*urgent + 0.15*warm)
function composite(factors: ScoreFactor[]): number {
  const f = (k: string) => factors.find((x) => x.key === k)?.value ?? 0;
  const base = 100 * f("real") * f("icp_fit");
  return Math.round(base * (0.6 + 0.25 * f("urgent") + 0.15 * f("warm")));
}

export async function scoreSignal(input: ScoreInput, cfg: ScoreConfig): Promise<ScoredSignal> {
  const warm = lookupRelationship(input.signal.contact.full_name, input.signal.account.name);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1600,
    system: fill(prompt(), cfg, input, warm),
    messages: [{ role: "user", content: "Score this prospect. Call emit_score." }],
    tools: [EMIT_TOOL],
    tool_choice: { type: "tool", name: "emit_score" },
  });
  const tu = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  const out = (tu?.input ?? {}) as Omit<ScoredSignal, "signal_id" | "score" | "warm_path" | "factors"> & {
    factors: ScoreFactor[];
  };
  return {
    signal_id: input.signal.signal_id,
    score: composite(out.factors ?? []),
    rank_reason: out.rank_reason,
    factors: out.factors ?? [],
    enriched: input.enriched,
    warm_path: warm ?? undefined,
    drafts: out.drafts ?? [],
    evidence: out.evidence ?? [],
  };
}

// Score the batch, rank, return only the top N — the overloaded rep's worklist.
export async function scoreAndRank(inputs: ScoreInput[], cfg: ScoreConfig): Promise<ScoredSignal[]> {
  const scored = await Promise.all(inputs.map((i) => scoreSignal(i, cfg)));
  return scored.sort((a, b) => b.score - a.score).slice(0, cfg.topN ?? 7);
}
