// The Litmus scoring engine — THE PRODUCT. Replaces the old binary verify loop.
// A Claude (Fable) call that scores a normalized Signal + EnrichedContact into a
// ranked ScoredSignal with a cited reason. Forces structured JSON output.
//
// Operates ONLY on canonical types (see normalize.ts). Never sees raw vendor JSON.
//
// Score 0-100 = weighted composite of four factors, each cited:
//   real     — enriched.is_current_role && role matches signal          (FullEnrich)
//   warm     — relationship edge present, as_of still valid             (relationship.ts)
//   urgent   — signal freshness / window (job change < 90d scores high) (signal.detected_at)
//   icp_fit  — account.icp_match + persona fit                          (Sillage)
//
// Split of labor (why it's not vibes):
//   - Deterministic extraction sets the factor VALUES from hard fields.
//   - The model writes rank_reason + drafts from curated context, and can adjust
//     within bounds — but the score is auditable back to the cited fields.
//
// Tools available to the loop (cap ~5 iterations):
//   web_search (Anthropic server tool) — corroboration for the `real`/`urgent` factors.
//
// TODO Thursday: implement with @anthropic-ai/sdk, structured outputs, Fable model.

import type { Signal, EnrichedContact, ScoredSignal, ClientContext, Feedback } from "./types";
import { lookupRelationship } from "./relationship";

export interface ScoreInput {
  signal: Signal;
  enriched?: EnrichedContact;
  accountContext?: string; // curated aggregate of the account's Sillage signals, for reasoning
}

export interface ScoreConfig {
  clientContext: ClientContext; // set once — grounds icp_fit + drafts (LITMUS.md {{CLIENT_CONTEXT}})
  feedbackExamples?: Feedback[]; // recent 👍/👎 + reasons -> few-shot ({{FEEDBACK_EXAMPLES}})
  topN?: number; // filter the worklist — default 5-10, never dump everything
}

// Loads LITMUS.md, fills the {{...}} slots, calls Fable with structured output.
export async function scoreSignal(_input: ScoreInput, _cfg: ScoreConfig): Promise<ScoredSignal> {
  // 1. deterministic factor extraction (real/urgent/icp_fit from fields; warm via lookupRelationship)
  // 2. render LITMUS.md with CLIENT_CONTEXT + SIGNAL + ENRICHED + WARM_PATH + FEEDBACK_EXAMPLES
  // 3. Fable structured call -> { score, rank_reason, factors, drafts, evidence }
  void lookupRelationship;
  throw new Error("TODO: implement the scoring engine (loads LITMUS.md)");
}

// Score the batch, rank, and return only the top N — the overloaded rep's worklist.
export async function scoreAndRank(
  inputs: ScoreInput[],
  cfg: ScoreConfig,
): Promise<ScoredSignal[]> {
  const scored = await Promise.all(inputs.map((i) => scoreSignal(i, cfg)));
  const ranked = scored.sort((a, b) => b.score - a.score);
  return ranked.slice(0, cfg.topN ?? 7);
}
