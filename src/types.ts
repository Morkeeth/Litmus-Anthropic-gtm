// Litmus core types — v2 (two-axis: truth × warmth). Filled out Thursday.

export type Truth = "REAL" | "NOISE" | "UNPROVEN";
export type Warmth = "WARM" | "COLD";
export type Action = "WARM_INTRO" | "VERIFY_COLD" | "DROP" | "WATCH";

// Signal shape aligned with Sillage's public vocabulary (their 8 signal agents,
// three-layer source taxonomy). No public schema exists, so this mock matches their
// language; swap-in against the real feed means renaming fields at one boundary.
export type SignalAgent =
  | "competitor_activity"
  | "job_updates"
  | "content_engagement"
  | "influencer_engagement"
  | "champion_tracking"
  | "keyword_detection"
  | "job_posting_insights"
  | "account_based_signals";

export interface Signal {
  signal_id: string;
  agent: SignalAgent;
  // e.g. job_change | champion_new_role | competitor_engagement | hiring_wave | funding_round | keyword_mention
  type: string;
  category: "first_party" | "social" | "web";
  account: { name: string; domain?: string; icp_match?: boolean };
  contact: {
    full_name: string;
    role?: string;
    linkedin_url?: string;
    // champion_tracking only: where we knew them from
    previous_company?: string;
  };
  source?: { channel: string; url?: string };
  summary: string;
  detected_at: string;
  tier?: number;
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
