// The Litmus verification loop. This is the product.
// A Claude (Sonnet) agent loop with FullEnrich search/enrich exposed as tools.
// Forces structured JSON output. Explicit verdict rules, not vibes.
//
// Verdict rules:
//   company unverifiable                         -> NOISE
//   person not found in claimed role now         -> NOISE
//   person confirmed, no corroborating signal    -> NEEDS_SECOND_SIGNAL
//   person confirmed + corroboration             -> REAL
// Every verdict cites the exact FullEnrich fields that drove it.
//
// TODO Thursday: implement with @anthropic-ai/sdk, tool-use, cap ~5 iterations.

import type { Signal, LitmusResult } from "./types";

export async function verifySignal(_signal: Signal): Promise<LitmusResult> {
  throw new Error("TODO: implement the Claude verify loop");
}
