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

import type { Signal, EnrichedContact, ScoredSignal } from "./types";
import { lookupRelationship } from "./relationship";

export interface ScoreInput {
  signal: Signal;
  enriched?: EnrichedContact;
  // curated account context for the reasoning step (aggregated Sillage signals, summaries)
  accountContext?: string;
}

export async function scoreSignal(_input: ScoreInput): Promise<ScoredSignal> {
  // 1. deterministic factor extraction (real / urgent / icp_fit from fields; warm from lookupRelationship)
  // 2. Claude/Fable call: given canonical facts + curated context, emit
  //    { score, rank_reason, drafts[email,linkedin], evidence[] } as structured JSON
  // 3. return ScoredSignal
  void lookupRelationship;
  throw new Error("TODO: implement the scoring engine");
}

// Rank a batch into the worklist the rep actually sees.
export async function scoreAndRank(inputs: ScoreInput[]): Promise<ScoredSignal[]> {
  const scored = await Promise.all(inputs.map(scoreSignal));
  return scored.sort((a, b) => b.score - a.score);
}
