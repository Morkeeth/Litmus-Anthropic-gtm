// Litmus core types. Filled out Thursday.

export type Verdict = "REAL" | "NOISE" | "NEEDS_SECOND_SIGNAL";

export interface Signal {
  signal_id: string;
  type: string;
  family: "first_party" | "social" | "web";
  person: {
    full_name: string;
    linkedin_url?: string;
    new_title?: string;
    new_company?: string;
  };
  org: { name: string; domain?: string };
  context: string;
  detected_at: string;
  confidence: number;
  expected_verdict?: string; // demo aid only
}

export interface EvidenceItem {
  check: string; // e.g. "company_exists", "person_in_role", "second_signal"
  result: "pass" | "fail" | "inconclusive";
  detail: string; // which FullEnrich field/value drove it
}

export interface LitmusResult {
  signal_id: string;
  verdict: Verdict;
  confidence: number;
  evidence: EvidenceItem[];
}
