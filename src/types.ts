// Litmus canonical types — v3 (scoring pipeline).
// The scoring engine + system prompt operate ONLY on these shapes.
// Raw Sillage / FullEnrich JSON never reaches the model — normalize.ts maps into these first.

// ---------- Canonical inputs (produced by normalize.ts) ----------

export type SignalAgent =
  | "competitor_activity"
  | "job_updates"
  | "content_engagement"
  | "influencer_engagement"
  | "champion_tracking"
  | "keyword_detection"
  | "job_posting_insights"
  | "account_based_signals";

// One intent event, source-normalized. From Sillage (live) or mock.
export interface Signal {
  signal_id: string;
  agent: SignalAgent;
  type: string; // job_change | champion_new_role | competitor_engagement | hiring_wave | funding_round | keyword_mention
  category: "first_party" | "social" | "web";
  account: { name: string; domain?: string; icp_match?: boolean };
  contact: {
    full_name: string;
    role?: string;
    linkedin_url?: string;
    previous_company?: string; // champion_tracking: where we knew them
  };
  summary: string;
  detected_at: string;
  tier?: number;
  raw?: unknown; // original vendor payload, kept for the evidence chain, never sent to the model
}

// FullEnrich, source-normalized. The reachability + "is she really there now" facts.
export interface EnrichedContact {
  full_name: string;
  title?: string;
  is_current_role?: boolean; // FullEnrich employment.current.is_current
  role_started_at?: string; // employment.current.start_at
  company?: { name?: string; domain?: string };
  work_email?: { email: string; status: string }; // status: DELIVERABLE | ...
  mobile?: { number: string; region?: string };
  linkedin_url?: string;
  raw?: unknown;
}

// ---------- Scoring output (the product) ----------

export interface ScoreFactor {
  key: "real" | "warm" | "urgent" | "icp_fit";
  value: number; // 0..1 contribution
  detail: string; // the exact field / edge that drove it (for the evidence chain)
}

// Turns a thin signal ("clicked a newsletter") into a concrete reason to act now.
export interface WhyNow {
  trigger: string; // the specific event/signal — "opened pricing 3x this week", "VP Sales started 3 weeks ago"
  what_changed: string; // what is materially different now vs before — "new GTM leader", "just raised Series B"
  why_buying: string; // why that change implies buying readiness for THIS seller
}

export interface WarmPath {
  via: string;
  relationship: string;
  strength: number;
  as_of: string;
}

export interface Draft {
  channel: "email" | "linkedin";
  subject?: string; // email only
  body: string;
  approved?: boolean; // set by the rep's thumbs up/down before send (human gate)
}

// Set up ONCE in onboarding. Grounds icp_fit scoring + the drafts. Injected into LITMUS.md.
export interface ClientContext {
  // WHO — pullable from Sillage persona / FullEnrich (firmographics the tools already know)
  icp: string; // company + personas + disqualifiers
  // WHAT — seller-only: feeds icp_fit reasoning + draft substance
  what_we_sell: string;
  competitors?: string;
  proof_assets?: string; // case studies, integrations, logos
  // HOW — seller-only: feeds the drafts
  tone_of_voice: string;
  outreach_approach?: string;
  example_that_worked?: string;
  // WHY-GOOD — the judgment no data tool has: what makes a prospect hot for THIS seller
  why_good?: string; // 2-3 rules, e.g. "recent VP Sales change", "using a competitor", "hiring SDRs fast"
}

// Feedback event — feeds the learning loop. Recent ones become few-shot in LITMUS.md.
export interface Feedback {
  signal_id: string;
  kind: "output_eval" | "client_reply"; // rep thumbs vs prospect actually replied
  target?: "lead" | "message"; // did they rate the LEAD (scoring) or the MESSAGE (draft)?
  verdict: "up" | "down";
  reason?: string; // the attribution label that tunes the prompt
  at: string;
}

export interface ScoredSignal {
  signal_id: string;
  score: number; // 0..100 composite
  signal_type?: string; // carried for the suppression ledger (detect signal change)
  detected_at?: string; // carried for the suppression ledger (detect fresher signal)
  rank_reason: string; // the one sentence a rep reads — written by the model
  why_now?: WhyNow; // the pinpointed reason this account is interesting RIGHT NOW
  factors: ScoreFactor[];
  enriched?: EnrichedContact;
  warm_path?: WarmPath;
  drafts: Draft[]; // email + linkedin, ready for the action layer
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  check: string; // "person_in_role" | "relationship_edge" | "signal_freshness" | "icp_match"
  source: "fullenrich" | "sillage" | "relationship_db" | "web_search";
  result: "pass" | "fail" | "inconclusive";
  detail: string;
}

// Relationship DB row (seeded, read-only)
export interface RelationshipEdge {
  person_name: string;
  person_company?: string;
  via: string;
  relationship: string;
  strength: number;
  as_of: string;
}
