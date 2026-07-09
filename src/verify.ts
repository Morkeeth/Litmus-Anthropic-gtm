// The Litmus verification loop. This is the product.
// A Claude (Fable) agent loop with FullEnrich + relationship lookup exposed as tools.
// Forces structured JSON output. Explicit per-axis rules, not vibes.
//
// Truth axis:
//   company unverifiable                       -> NOISE
//   person not found in claimed role now       -> NOISE
//   person confirmed, no corroborating signal  -> UNPROVEN
//   person confirmed + corroboration           -> REAL
// Warmth axis:
//   relationship edge found (as_of valid)      -> WARM (cite via + strength)
//   no edge                                    -> COLD
// Action (derived, never free-form):
//   REAL + WARM  -> WARM_INTRO
//   REAL + COLD  -> VERIFY_COLD
//   NOISE        -> DROP
//   UNPROVEN     -> WATCH
// Every verdict cites the exact FullEnrich fields / relationship edge that drove it.
//
// Tools exposed to the agent (cap ~5 iterations to bound latency):
//   company_lookup / company_search   FullEnrich sync (truth)
//   people_lookup / people_search     FullEnrich sync (truth — profiles only, no email/phone)
//   enrich_contact(person)            FullEnrich async waterfall (email/phone; poll wrapped inside)
//   lookup_relationship(person, co?)  relationship.ts (warmth, seeded)
//   web_search                        Anthropic server tool — independent corroboration (second signal)
//
// TODO Thursday: implement with @anthropic-ai/sdk, tool-use, structured output.

import type { Signal, LitmusResult } from "./types";

export async function verifySignal(_signal: Signal): Promise<LitmusResult> {
  throw new Error("TODO: implement the verify loop");
}
