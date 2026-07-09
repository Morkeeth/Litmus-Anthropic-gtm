import { NextResponse } from "next/server";
import { runIcpWorkflow } from "../../../lib/pipeline";
import type { ClientContext } from "../../../src/types";

// LIVE workflow (Flow A): needs FULLENRICH_API_KEY + ANTHROPIC_API_KEY.
// POST { clientContext, topN? } -> real ranked prospects from the FullEnrich database, scored by LITMUS.md.
export const runtime = "nodejs";
export const maxDuration = 300; // the enrich waterfall polls 30-90s

export async function POST(req: Request) {
  if (!process.env.FULLENRICH_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "missing FULLENRICH_API_KEY or ANTHROPIC_API_KEY" }, { status: 400 });
  }
  try {
    const { clientContext, topN } = (await req.json()) as { clientContext: ClientContext; topN?: number };
    const prospects = await runIcpWorkflow(clientContext, topN ?? 7);
    return NextResponse.json({ prospects, source: "live", scored_at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
