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
