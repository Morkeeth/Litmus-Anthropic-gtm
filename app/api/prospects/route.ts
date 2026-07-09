import { NextResponse } from "next/server";
import scored from "../../../mock/scored.json";
import { readBriefCache } from "../../../lib/cache";

// The dashboard's default load. Serves the PRE-WARMED real brief if one exists (instant, no 3-min
// wait), else the curated mock. So the dashboard shows real cached data without running live on stage.
export async function GET() {
  const cache = readBriefCache();
  if (cache?.prospects?.length) {
    return NextResponse.json({ prospects: cache.prospects, source: "cache", scored_at: cache.at });
  }
  const prospects = [...scored].sort((a, b) => b.score - a.score);
  return NextResponse.json({ prospects, source: "mock", scored_at: null });
}
