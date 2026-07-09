import { NextResponse } from "next/server";

// Which sources are already connected server-side (via .env)? So onboarding doesn't ask the user
// to re-paste keys that already exist. In production each tenant brings their own; in the demo,
// the workspace keys are already set, so we just report them as connected.
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    fullenrich: !!process.env.FULLENRICH_API_KEY,
    sillage: !!process.env.SILLAGE_API_KEY,
    hubspot: !!process.env.HUBSPOT_TOKEN,
    unipile: !!(process.env.UNIPILE_API_KEY && process.env.UNIPILE_DSN),
    slack: !!process.env.SLACK_BOT_TOKEN,
    xai: !!process.env.XAI_API_KEY,
    send_armed: process.env.LITMUS_SEND_ARMED === "1",
  });
}
