// Litmus core types — v2 (two-axis: truth × warmth). Filled out Thursday.

export type Truth = "REAL" | "NOISE" | "UNPROVEN";
export type Warmth = "WARM" | "COLD";
export type Action = "WARM_INTRO" | "VERIFY_COLD" | "DROP" | "WATCH";

export interface Signal {
  signal_id: string;
  // job_change | intent_surge | keyword_mention | champion_move | funding | hiring
  type: string;
  family: "first_party" | "social" | "web";
  person: {
    full_name: string;
    linkedin_url?: string;
    new_title?: string;
    new_company?: string;
    // champion_move only: where we knew them from
    previous_company?: string;
  };
  org: { name: string; domain?: string };
  context: string;
  detected_at: string;
  confidence: number;
  expected_verdict?: string; // demo aid only
}

export interface EvidenceItem {
  // truth axis: "company_exists" | "person_in_role" | "second_signal"
  // warmth axis: "relationship_edge"
  check: string;
  axis: "truth" | "warmth";
  result: "pass" | "fail" | "inconclusive";
  detail: string; // the exact FullEnrich field / relationship edge that drove it
}

export interface WarmPath {
  via: string; // who can make the intro
  relationship: string; // e.g. "ex-colleague, 3y overlap" | "past champion at <company>"
  strength: number; // 0..1
  as_of: string; // edges decay too — cite freshness
}

export interface LitmusResult {
  signal_id: string;
  truth: Truth;
  warmth: Warmth;
  warm_path?: WarmPath; // present iff warmth === "WARM"
  action: Action; // derived from the 2×2, never free-form
  confidence: number;
  evidence: EvidenceItem[]; // spans both axes
}

// Relationship DB row (seeded, read-only — we never crawl)
export interface RelationshipEdge {
  person_name: string;
  person_company?: string;
  via: string; // who on our side holds the edge
  relationship: string;
  strength: number; // 0..1
  as_of: string;
}
