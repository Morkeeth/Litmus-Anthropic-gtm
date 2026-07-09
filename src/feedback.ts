// The learning loop. Two feedback sources tune LITMUS.md over time:
//   1. output_eval  — the rep's 👍/👎 (+ reason) at the approval gate, before send.
//   2. client_reply — did the prospect actually reply (via Unipile inbound webhook)?
//
// No training. Recent feedback is injected back into LITMUS.md as few-shot ({{FEEDBACK_EXAMPLES}}),
// so the scorer stops repeating rejected patterns and leans into approved ones. That's the
// hackathon-real learning loop; outcome-weighting the score is the prod version.

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Feedback } from "./types";

const LOG = join(process.cwd(), "data/feedback.jsonl");

export function recordFeedback(f: Feedback): void {
  try { appendFileSync(LOG, JSON.stringify(f) + "\n"); } catch { /* best-effort */ }
}

export function loadFeedback(limit = 20): Feedback[] {
  try {
    if (!existsSync(LOG)) return [];
    return readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Feedback).slice(-limit);
  } catch {
    return [];
  }
}

// Render recent feedback as the {{FEEDBACK_EXAMPLES}} block for LITMUS.md.
export function feedbackToFewShot(items: Feedback[]): string {
  if (items.length === 0) return "(no feedback yet)";
  return items
    .map((f) => `- [${f.verdict.toUpperCase()}] signal ${f.signal_id}${f.reason ? ` — ${f.reason}` : ""}`)
    .join("\n");
}
