import { NextResponse } from "next/server";
import scored from "../../../mock/scored.json";

// Returns the ranked worklist for today's brief.
//
// DEMO / pre-kickoff: serves pre-scored mock (real shapes) so the Vercel deploy is alive
// with no keys. The mock is already ranked + includes the killed false-positive and the
// out-of-ICP, so the demo tells the whole story.
//
// LIVE (swap when keys exist): run the real pipeline —
//   pull Sillage signals (MCP) -> normalize -> FullEnrich enrich -> scoreAndRank(LITMUS.md)
//   with the rep's client-context. Cache results; this route reads the cache.
export async function GET() {
  const prospects = [...scored].sort((a, b) => b.score - a.score);
  return NextResponse.json({ prospects, source: "mock", scored_at: null });
}
