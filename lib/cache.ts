// Brief cache — the pre-warm. The real agent loop takes ~3 min; we never run it live on stage.
// Persisted in Supabase when configured (survives Vercel cold starts), else a local file.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { supabase } from "./supabase";
import type { ScoredSignal } from "../src/types";

const FILE = join(process.cwd(), "data/cache-brief.json");

export async function writeBriefCache(prospects: ScoredSignal[], meta: Record<string, unknown> = {}): Promise<void> {
  if (supabase) {
    try {
      await supabase.from("brief_cache").insert({ source: (meta.source as string) ?? null, prospects });
      return;
    } catch {
      /* fall through to file */
    }
  }
  try {
    writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), ...meta, prospects }));
  } catch {
    /* best-effort */
  }
}

export async function readBriefCache(): Promise<{ at: string; prospects: ScoredSignal[] } | null> {
  if (supabase) {
    try {
      const { data } = await supabase.from("brief_cache").select("at,prospects").order("at", { ascending: false }).limit(1);
      if (data?.length) return { at: data[0].at, prospects: data[0].prospects as ScoredSignal[] };
    } catch {
      /* fall through to file */
    }
  }
  try {
    return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
  } catch {
    return null;
  }
}
