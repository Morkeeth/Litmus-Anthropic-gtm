// Relationship DB — the warmth axis. SEEDED ONLY, read-only, one lookup. We never crawl.
// Sources: (a) Sillage champion-move history if we get it, (b) mock/relationships.json (team network).
// Scope guardrail: this module is a ~1h box. If it slips, Litmus degrades gracefully to truth-only.
// TODO Thursday: load seed, implement lookup. Flat JSON first; SQLite only if time allows.

import { readFileSync } from "node:fs";
import type { RelationshipEdge, WarmPath } from "./types";

let edges: RelationshipEdge[] | null = null;

function load(): RelationshipEdge[] {
  if (!edges) {
    edges = JSON.parse(
      readFileSync(new URL("../mock/relationships.json", import.meta.url), "utf8"),
    );
  }
  return edges!;
}

// The one tool the agent gets on this axis.
// Match on person name (+ company when present). Return best edge or null.
export function lookupRelationship(
  personName: string,
  company?: string,
): WarmPath | null {
  const hits = load().filter(
    (e) =>
      e.person_name.toLowerCase() === personName.toLowerCase() &&
      (!company ||
        !e.person_company ||
        e.person_company.toLowerCase() === company.toLowerCase()),
  );
  if (hits.length === 0) return null;
  const best = hits.sort((a, b) => b.strength - a.strength)[0];
  return {
    via: best.via,
    relationship: best.relationship,
    strength: best.strength,
    as_of: best.as_of,
  };
}
