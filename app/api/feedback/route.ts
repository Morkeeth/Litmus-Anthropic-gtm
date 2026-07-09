import { NextResponse } from "next/server";
import { recordAction } from "../../../lib/ledger";

// Records the rep's approval-gate feedback (👍/👎 + reason).
// - Feeds the learning loop (injected into LITMUS.md as {{FEEDBACK_EXAMPLES}}).
// - Also writes to the suppression ledger so sent/declined leads don't reappear tomorrow.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { signal_id?: string; key?: string; verdict?: "up" | "down"; reason?: string };
  const event = { ...body, at: new Date().toISOString() };
  console.log("[litmus feedback]", event);
  if (body.key && body.verdict) recordAction(body.key, body.verdict === "up" ? "sent" : "declined");
  return NextResponse.json({ ok: true, event });
}
