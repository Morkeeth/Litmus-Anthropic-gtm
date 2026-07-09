import { NextResponse } from "next/server";

// Records the rep's approval-gate feedback (👍/👎 + reason).
// This is the learning loop: recent feedback gets injected into LITMUS.md as {{FEEDBACK_EXAMPLES}}
// so the scorer stops repeating rejected patterns.
//
// DEMO: accept + echo (serverless FS is ephemeral on Vercel). LIVE: persist to a store
// (feedback.jsonl locally, or KV/Supabase) via src/feedback.ts recordFeedback().
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const event = { ...body, at: new Date().toISOString() };
  // TODO live: recordFeedback(event) -> data/feedback.jsonl / KV
  console.log("[litmus feedback]", event);
  return NextResponse.json({ ok: true, event });
}
