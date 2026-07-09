// Transformation layer. The ONLY place that touches raw vendor JSON.
// Maps Sillage + FullEnrich payloads -> canonical Signal / EnrichedContact.
// Everything downstream (scoring, system prompt, UI) sees canonical shapes only.
//
// FullEnrich: schema is DOCUMENTED — this mapping is written now, verified.
// Sillage: no public schema — the canonical TARGET is fixed; fill the field paths at 9:30
//          against the real MCP payload. The mock already emits canonical Signal directly.

import type { Signal, EnrichedContact } from "./types";

// ---------- Sillage -> Signal ----------
// Input: one item from sillage_v2_list_signals / get_signal (shape confirmed at kickoff).
// TODO 9:30: adjust field paths to the live payload. Keep the canonical output stable.
export function normalizeSillageSignal(raw: any): Signal {
  return {
    signal_id: raw.id ?? raw.signal_id,
    agent: raw.agent,
    type: raw.type,
    category: raw.category ?? "social",
    account: {
      name: raw.account?.name ?? raw.account_name,
      domain: raw.account?.domain,
      icp_match: raw.account?.icp_match,
    },
    contact: {
      full_name: raw.contact?.full_name ?? raw.contact?.name,
      role: raw.contact?.role ?? raw.contact?.title,
      linkedin_url: raw.contact?.linkedin_url,
      previous_company: raw.contact?.previous_company,
    },
    summary: raw.summary ?? "",
    detected_at: raw.detected_at ?? raw.created_at,
    tier: raw.tier,
    raw,
  };
}

// ---------- Sillage live detection (+ lead) -> Signal ----------
// Field paths verified against the real MCP payload Jul 9 (captured: data/sillage-samples.json).
// A detection is { id, signal_type, data: <typed per signal_type>, detected_at, signal_date,
// lead_id, company_id, agent_id, source_url, author, excerpt } — the intent evidence lives in
// `data` and MUST survive into the summary or the scorer never sees the why-now.
const SILLAGE_AGENT_MAP: Record<string, Signal["agent"]> = {
  recentlyPromoted: "job_updates",
  newPosition: "job_updates",
  jobChange: "job_updates",
  keyword: "keyword_detection",
  keywordMention: "keyword_detection",
  competitor: "competitor_activity",
  contentEngagement: "content_engagement",
};

function sillageSummary(det: any, companyName: string): string {
  const d = det?.data ?? {};
  if (det.signal_type === "recentlyPromoted" || det.signal_type === "newPosition") {
    const prev = d.previous_position, next = d.new_position;
    const from = prev ? `${prev.role} at ${prev.company_name}` : "previous role";
    const to = next ? `${next.role} at ${next.company_name}` : "new role";
    return `Promoted/changed role: ${from} -> ${to}${next?.start_date ? ` (started ${next.start_date})` : ""}`;
  }
  if (det.excerpt) return `${det.signal_type}: ${det.excerpt}`;
  return `${det.signal_type} at ${companyName}${Object.keys(d).length ? ` — ${JSON.stringify(d)}` : ""}`;
}

export function normalizeSillageDetection(det: any, lead?: any): Signal {
  const l = lead?.data ?? lead ?? {};
  const company = l.company?.name ?? "";
  return {
    signal_id: `sil_${det.id}`,
    agent: SILLAGE_AGENT_MAP[det.signal_type] ?? "account_based_signals",
    type: det.signal_type ?? "signal",
    category: det.source_url ? "social" : "web",
    account: { name: company, domain: l.company?.domain ?? undefined, icp_match: true },
    contact: {
      full_name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.linkedin_headline || "",
      role: l.position ?? undefined,
      linkedin_url: l.linkedin_url ?? undefined,
      previous_company: det?.data?.previous_position?.company_name,
    },
    summary: sillageSummary(det, company),
    // urgency scores off the TRIGGER date, not when Sillage crawled it
    detected_at: det.signal_date ?? det.detected_at ?? new Date().toISOString(),
    raw: det,
  };
}

// ---------- FullEnrich people/lookup -> EnrichedContact (truth check) ----------
export function normalizeFullEnrichProfile(raw: any): EnrichedContact {
  const p = raw?.people?.[0] ?? raw;
  const cur = p?.employment?.current ?? {};
  return {
    full_name: p?.full_name,
    title: cur?.title,
    is_current_role: cur?.is_current,
    role_started_at: cur?.start_at,
    company: { name: cur?.company?.name, domain: cur?.company?.domain },
    linkedin_url: p?.social_profiles?.professional_network?.url,
    raw,
  };
}

// ---------- FullEnrich contact/enrich/bulk -> reachability (merge into EnrichedContact) ----------
export function mergeFullEnrichContactInfo(base: EnrichedContact, raw: any): EnrichedContact {
  const d = raw?.data?.[0]?.contact_info ?? raw?.contact_info ?? {};
  const email = d?.most_probable_work_email ?? d?.work_emails?.[0];
  const phone = d?.most_probable_phone ?? d?.phones?.[0];
  return {
    ...base,
    work_email: email ? { email: email.email, status: email.status } : base.work_email,
    mobile: phone ? { number: phone.number, region: phone.region } : base.mobile,
  };
}
