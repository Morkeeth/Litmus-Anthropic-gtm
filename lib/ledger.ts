// Suppression ledger — stops the same lead reappearing day after day.
// Keys a prospect by identity, logs when surfaced/sent/declined, and suppresses within a
// cooldown window unless a materially stronger signal justifies a second touch.
//
// Local/demo: data/ledger.jsonl. Prod: swap the store for KV/Supabase (serverless FS is ephemeral).

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ScoredSignal } from "../src/types";

const LEDGER = join(process.cwd(), "data/ledger.jsonl");
const COOLDOWN_DAYS: Record<string, number> = { surfaced: 7, declined: 21, sent: 60 };
const RESURFACE_SCORE_JUMP = 15; // resurface early only if the new score beats the last by this much

type Entry = { key: string; status: "surfaced" | "sent" | "declined"; at: string; score: number; fp: string };

export function contactKey(s: ScoredSignal): string {
  const e = s.enriched;
  const raw = e?.work_email?.email || e?.linkedin_url || (e?.full_name && `${e.full_name}@${e?.company?.name ?? ""}`) || s.signal_id;
  return String(raw).toLowerCase().trim();
}

// What would make this lead worth showing AGAIN: their company, role, and the signal driving it.
// If any of these changed since we last surfaced them, it's new information — not a stale repeat.
export function fingerprint(s: ScoredSignal): string {
  const e = s.enriched;
  return [e?.company?.domain ?? e?.company?.name ?? "", e?.title ?? "", s.signal_type ?? "", s.detected_at ?? ""].join("|").toLowerCase();
}

function load(): Entry[] {
  try {
    return existsSync(LEDGER)
      ? readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Entry)
      : [];
  } catch {
    return [];
  }
}

// Drop prospects seen within cooldown, keeping those whose new score jumped materially.
export function filterSuppressed(scored: ScoredSignal[]): ScoredSignal[] {
  const lastByKey = new Map<string, Entry>();
  for (const e of load()) {
    const prev = lastByKey.get(e.key);
    if (!prev || e.at > prev.at) lastByKey.set(e.key, e);
  }
  const now = Date.now();
  return scored.filter((s) => {
    const last = lastByKey.get(contactKey(s));
    if (!last) return true; // never seen
    const days = (now - Date.parse(last.at)) / 86_400_000;
    if (days >= (COOLDOWN_DAYS[last.status] ?? 7)) return true; // cooldown elapsed
    if (fingerprint(s) !== last.fp) return true; // job / company / signal CHANGED — new information
    if (s.score - last.score >= RESURFACE_SCORE_JUMP) return true; // materially stronger
    return false; // stale, nothing happened — suppress
  });
}

export function recordSurfaced(scored: ScoredSignal[]): void {
  try {
    const at = new Date().toISOString();
    for (const s of scored) appendFileSync(LEDGER, JSON.stringify({ key: contactKey(s), status: "surfaced", at, score: s.score, fp: fingerprint(s) }) + "\n");
  } catch {
    /* best-effort */
  }
}

// Called from the approval gate: sent (approved) or declined suppress harder than a plain surface.
export function recordAction(key: string, status: "sent" | "declined", score = 0): void {
  try {
    appendFileSync(LEDGER, JSON.stringify({ key, status, at: new Date().toISOString(), score, fp: "" }) + "\n");
  } catch {
    /* best-effort */
  }
}
