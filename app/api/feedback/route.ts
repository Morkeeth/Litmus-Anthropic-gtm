import { NextResponse } from "next/server";
import { recordAction } from "../../../lib/ledger";
import { recordFeedback } from "../../../src/feedback";
import { supabase } from "../../../lib/supabase";
import type { Feedback } from "../../../src/types";

// The review step — closes the learning loop.
// Accepts structured ratings of the LEAD (scoring) and the MESSAGE (draft), each 👍/👎 + reason.
// Writes each to feedback.jsonl (→ injected into LITMUS.md as {{FEEDBACK_EXAMPLES}} → scoring improves)
// AND to the suppression ledger (a declined lead goes quiet).
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    signal_id?: string;
    key?: string;
    lead?: { verdict: "up" | "down"; reason?: string };
    message?: { verdict: "up" | "down"; reason?: string };
    verdict?: "up" | "down"; // legacy quick approve/decline
    reason?: string;
  };
  const at = new Date().toISOString();
  const events: Feedback[] = [];
  const push = (f: Feedback) => {
    recordFeedback(f);
    events.push(f);
    if (supabase) supabase.from("feedback").insert({ signal_id: f.signal_id, target: f.target ?? null, verdict: f.verdict, reason: f.reason ?? null }).then(() => {}, () => {});
  };

  if (b.lead?.verdict) push({ signal_id: b.signal_id ?? "", kind: "output_eval", target: "lead", verdict: b.lead.verdict, reason: b.lead.reason, at });
  if (b.message?.verdict) push({ signal_id: b.signal_id ?? "", kind: "output_eval", target: "message", verdict: b.message.verdict, reason: b.message.reason, at });
  if (b.verdict && !b.lead && !b.message) push({ signal_id: b.signal_id ?? "", kind: "output_eval", verdict: b.verdict, reason: b.reason, at });

  const leadVerdict = b.lead?.verdict ?? b.verdict;
  if (b.key && leadVerdict) recordAction(b.key, leadVerdict === "up" ? "sent" : "declined");

  return NextResponse.json({ ok: true, recorded: events.length });
}
