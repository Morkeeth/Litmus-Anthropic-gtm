import { NextResponse } from "next/server";
import { slackSink } from "../../../src/sinks";
import scored from "../../../mock/scored.json";

// Verify Slack delivery independent of the scoring pipeline.
// POST once SLACK_BOT_TOKEN+SLACK_CHANNEL (or SLACK_WEBHOOK_URL) is set — posts a 3-card sample.
export const runtime = "nodejs";

export async function POST() {
  try {
    await slackSink.push((scored as any[]).slice(0, 3));
    return NextResponse.json({ ok: true, posted: 3 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
