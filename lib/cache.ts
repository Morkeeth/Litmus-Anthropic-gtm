// Brief cache — the pre-warm. The real agent loop takes ~3 min; we never run it live on stage.
// Pre-warm once (run the pipeline), cache the scored brief, and the dashboard reads the cache
// instantly. Same real data, no 3-minute wait. (Local/warm-instance; prod would use KV/Supabase.)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ScoredSignal } from "../src/types";

const FILE = join(process.cwd(), "data/cache-brief.json");

export function writeBriefCache(prospects: ScoredSignal[], meta: Record<string, unknown> = {}): void {
  try {
    writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), ...meta, prospects }));
  } catch {
    /* best-effort */
  }
}

export function readBriefCache(): { at: string; prospects: ScoredSignal[] } | null {
  try {
    return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
  } catch {
    return null;
  }
}
