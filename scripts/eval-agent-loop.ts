// Offline eval harness for the Flow B agent loop (lib/agent-loop.ts).
// Feeds the loop a fixed batch built from the cached Sillage payload (data/sillage-samples.json)
// plus synthetic detections in the exact same payload shape, with verify_person STUBBED from
// fixtures — zero FullEnrich credits, deterministic tool results. Grades each run on a rubric:
// deterministic checks in code (contract, calibration, triage efficiency) + a judge model call
// against LITMUS.md's own why_now / batch-judgment standards.
//
// Run: npx tsx scripts/eval-agent-loop.ts [--runs 2] [--label baseline]
// Requires ANTHROPIC_API_KEY (the loop + judge are model calls; that's the only spend).

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// .env loader (no dotenv dep — Next loads .env itself, this script runs outside Next)
try {
  for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* fine — env may already be set */ }
import type { ClientContext, EnrichedContact } from "../src/types";
import { normalizeSillageDetection } from "../src/normalize";
import { agentLoop, composite, type BatchEntry } from "../lib/agent-loop";

const MODEL = process.env.LITMUS_MODEL || "claude-sonnet-5";
const TOP_N = 3;
const VERIFY_BUDGET = Math.max(TOP_N * 2, 4); // mirrors agentSystemPrompt

// ---------- client context (fixed for the eval) ----------

const CTX: ClientContext = {
  icp: "B2B SaaS or fintech companies, 200–5000 employees, US/EU. Personas we win with: VP/SVP Sales, CRO, Head of Revenue/RevOps. Disqualifiers: non-B2B (retail, food, local services), companies under 50 employees, students/job-seekers, agencies.",
  what_we_sell:
    "Litmus — a GTM intent-scoring layer. It watches the intent firehose (job changes, funding, hiring waves, competitor signals), scores every prospect against what the seller sells, and hands the rep a ranked morning brief with a cited why-now and ready-to-send drafts.",
  competitors: "Clari, Gong Engage, Common Room",
  proof_assets: "Case study: Attio's sales team cut prospect-triage time 80%; integrates with HubSpot + Slack.",
  tone_of_voice: "Direct, specific, no fluff. Never 'hope this finds you well'. Short sentences. One clear ask.",
  outreach_approach: "Insight-led: open with the specific trigger we saw, connect it to their new problem, one-line ask.",
  why_good:
    "1) Recent sales-leadership change (<60 days) — new leaders rebuild their prospecting stack. 2) Hiring SDRs/AEs fast — team scaling means triage pain. 3) Using or evaluating a competitor (Clari, Gong).",
};

// ---------- the batch: 2 real cached detections + 6 synthetic in the same payload shape ----------

interface Fixture {
  det: any; // raw Sillage detection shape
  lead: any; // raw Sillage lead shape (getLead .data)
  warm: unknown;
  verify:
    | { found: true; contact: Omit<EnrichedContact, "raw"> }
    | { found: false; note: string };
  expect: {
    shouldVerify?: boolean; // triage: plausible winner worth a credit
    mustNotVerify?: boolean; // triage: obvious skip
    realMax?: number;
    realMin?: number;
    realExact?: number;
    urgentMax?: number;
  };
}

function loadCached() {
  const samples = JSON.parse(readFileSync(join(process.cwd(), "data/sillage-samples.json"), "utf8"));
  return { detections: samples.list_signals.data as any[], maxLead: samples.get_lead.data as any };
}

function buildFixtures(): Record<string, Fixture> {
  const { detections, maxLead } = loadCached();
  const [maxDet, danaDet] = detections; // both Ramp promotions — the natural duplicate-account pair

  const danaLead = {
    id: 1013453,
    first_name: "Dana",
    last_name: "Whitfield",
    linkedin_url: "https://linkedin.com/in/danawhitfield",
    position: "VP of Sales @ Ramp",
    location: "New York, New York, United States",
    company: maxLead.company,
  };

  return {
    // 1. REAL CACHED — clean confirm. Should verify, real ~1.0, top rank.
    [`sil_${maxDet.id}`]: {
      det: maxDet,
      lead: maxLead,
      warm: null,
      verify: {
        found: true,
        contact: {
          full_name: "Max Freeman",
          title: "SVP of Sales",
          is_current_role: true,
          role_started_at: "2026-06-01",
          company: { name: "Ramp", domain: "ramp.com" },
          linkedin_url: "https://linkedin.com/in/maxwellfreeman",
        },
      },
      expect: { shouldVerify: true, realMin: 0.9 },
    },
    // 2. REAL CACHED — same account (Ramp), stale-role verify: FullEnrich still shows the old
    // Senior Director title (index lag on the fresh promotion). Per the data-precedence rule the
    // person IS found at the claimed account, so real must be ≥ 0.5 — killing it as a
    // "contradiction" is the failure mode.
    [`sil_${danaDet.id}`]: {
      det: danaDet,
      lead: danaLead,
      warm: null,
      verify: {
        found: true,
        contact: {
          full_name: "Dana Whitfield",
          title: "Senior Director, Head of Commercial Sales",
          is_current_role: true,
          role_started_at: "2024-09-01",
          company: { name: "Ramp", domain: "ramp.com" },
          linkedin_url: "https://linkedin.com/in/danawhitfield",
        },
      },
      expect: { realMin: 0.5 },
    },
    // 3. PERSON LEFT — looks like a hot job-change signal, but FullEnrich says they're gone.
    sil_900001: {
      det: {
        id: 900001,
        signal_type: "newPosition",
        data: {
          previous_position: { role: "Senior Director of Sales", company_name: "Drata" },
          new_position: { role: "VP of Sales", company_name: "Vanta", start_date: "2026-06-15" },
        },
        detected_at: "2026-07-08T09:00:00.000Z",
        signal_date: "2026-06-15T00:00:00.000Z",
        lead_id: 900001,
        company_id: 900001,
        agent_id: 2358,
        source_url: null,
        author: null,
        excerpt: null,
      },
      lead: {
        id: 900001,
        first_name: "Jordan",
        last_name: "Blake",
        linkedin_url: "https://linkedin.com/in/jordanblake",
        position: "VP of Sales @ Vanta",
        location: "San Francisco, California, United States",
        company: { id: 900001, name: "Vanta", domain: "vanta.com", employee_range: "501-1000", location: "San Francisco" },
      },
      warm: null,
      verify: {
        found: true,
        contact: {
          full_name: "Jordan Blake",
          title: "VP of Sales",
          is_current_role: false, // left Vanta — the false-positive kill
          role_started_at: "2026-06-15",
          company: { name: "Vanta", domain: "vanta.com" },
          linkedin_url: "https://linkedin.com/in/jordanblake",
        },
      },
      expect: { shouldVerify: true, realExact: 0 },
    },
    // 4. NO MATCH — plausible on paper, FullEnrich finds nobody.
    sil_900002: {
      det: {
        id: 900002,
        signal_type: "newPosition",
        data: {
          previous_position: { role: "RevOps Lead", company_name: "Airtable" },
          new_position: { role: "Head of Revenue Operations", company_name: "Clay", start_date: "2026-06-20" },
        },
        detected_at: "2026-07-08T09:00:00.000Z",
        signal_date: "2026-06-20T00:00:00.000Z",
        lead_id: 900002,
        company_id: 900002,
        agent_id: 2358,
        source_url: null,
        author: null,
        excerpt: null,
      },
      lead: {
        id: 900002,
        first_name: "Priya",
        last_name: "Natarajan",
        linkedin_url: "https://linkedin.com/in/priyanatarajan",
        position: "Head of Revenue Operations @ Clay",
        location: "New York, New York, United States",
        company: { id: 900002, name: "Clay", domain: "clay.com", employee_range: "201-500", location: "New York" },
      },
      warm: null,
      verify: { found: false, note: "no FullEnrich match — treat real as unverifiable" },
      expect: { realMax: 0.5 },
    },
    // 5. THIN SIGNAL — 80-day-old newsletter click, no corroborating trigger. urgent must be ≤ 0.3.
    sil_900003: {
      det: {
        id: 900003,
        signal_type: "contentEngagement",
        data: { engagement: "clicked a link in the June newsletter" },
        detected_at: "2026-07-01T09:00:00.000Z",
        signal_date: "2026-04-18T00:00:00.000Z",
        lead_id: 900003,
        company_id: 900003,
        agent_id: 2360,
        source_url: "https://example.com/newsletter",
        author: null,
        excerpt: "clicked a link in the June newsletter",
      },
      lead: {
        id: 900003,
        first_name: "Sam",
        last_name: "Torres",
        linkedin_url: "https://linkedin.com/in/samtorres",
        position: "Director of Sales Operations @ Braze",
        location: "Austin, Texas, United States",
        company: { id: 900003, name: "Braze", domain: "braze.com", employee_range: "1001-5000", location: "New York" },
      },
      warm: null,
      verify: {
        found: true,
        contact: {
          full_name: "Sam Torres",
          title: "Director of Sales Operations",
          is_current_role: true,
          role_started_at: "2023-05-01",
          company: { name: "Braze", domain: "braze.com" },
          linkedin_url: "https://linkedin.com/in/samtorres",
        },
      },
      expect: { urgentMax: 0.3 },
    },
    // 6. ICP ZERO — bakery owner, 8 employees, non-B2B. Must not burn a credit.
    sil_900004: {
      det: {
        id: 900004,
        signal_type: "keyword",
        data: { keyword: "sales tools" },
        detected_at: "2026-07-07T09:00:00.000Z",
        signal_date: "2026-07-05T00:00:00.000Z",
        lead_id: 900004,
        company_id: 900004,
        agent_id: 2361,
        source_url: "https://linkedin.com/posts/mariedupont",
        author: "Marie Dupont",
        excerpt: "Looking for sales tools recommendations for my little bakery!",
      },
      lead: {
        id: 900004,
        first_name: "Marie",
        last_name: "Dupont",
        linkedin_url: "https://linkedin.com/in/mariedupont",
        position: "Owner @ Petit Four Bakery",
        location: "Lyon, France",
        company: { id: 900004, name: "Petit Four Bakery", domain: "petitfour.fr", employee_range: "1-10", location: "Lyon" },
      },
      warm: null,
      verify: { found: false, note: "no FullEnrich match — treat real as unverifiable" },
      expect: { mustNotVerify: true },
    },
    // 7. ICP ZERO — student, not a buyer. Must not burn a credit.
    sil_900005: {
      det: {
        id: 900005,
        signal_type: "contentEngagement",
        data: { engagement: "liked a post about GTM strategy" },
        detected_at: "2026-07-06T09:00:00.000Z",
        signal_date: "2026-07-04T00:00:00.000Z",
        lead_id: 900005,
        company_id: 900005,
        agent_id: 2360,
        source_url: "https://linkedin.com/posts/gtm-strategy",
        author: "Alex Kim",
        excerpt: "liked a post about GTM strategy",
      },
      lead: {
        id: 900005,
        first_name: "Alex",
        last_name: "Kim",
        linkedin_url: "https://linkedin.com/in/alexkimnyu",
        position: "MBA Candidate @ NYU Stern | Aspiring SDR",
        location: "New York, New York, United States",
        company: { id: 900005, name: "NYU Stern School of Business", domain: "stern.nyu.edu", employee_range: "1001-5000", location: "New York" },
      },
      warm: null,
      verify: { found: false, note: "no FullEnrich match — treat real as unverifiable" },
      expect: { mustNotVerify: true },
    },
    // 8. CLEAN CONFIRM + WARM PATH — new CRO, ex-colleague edge. Should verify and rank top.
    sil_900006: {
      det: {
        id: 900006,
        signal_type: "newPosition",
        data: {
          previous_position: { role: "VP of Sales", company_name: "Salesloft" },
          new_position: { role: "Chief Revenue Officer", company_name: "Attio", start_date: "2026-06-25" },
        },
        detected_at: "2026-07-08T09:00:00.000Z",
        signal_date: "2026-06-25T00:00:00.000Z",
        lead_id: 900006,
        company_id: 900006,
        agent_id: 2358,
        source_url: null,
        author: null,
        excerpt: null,
      },
      lead: {
        id: 900006,
        first_name: "Elena",
        last_name: "Ruiz",
        linkedin_url: "https://linkedin.com/in/elenaruiz",
        position: "Chief Revenue Officer @ Attio",
        location: "London, United Kingdom",
        company: { id: 900006, name: "Attio", domain: "attio.com", employee_range: "201-500", location: "London" },
      },
      warm: {
        via: "Karim Ben Ali",
        relationship: "ex-colleague at Salesloft; championed us there in 2024",
        strength: 0.9,
        as_of: "2026-03",
      },
      verify: {
        found: true,
        contact: {
          full_name: "Elena Ruiz",
          title: "Chief Revenue Officer",
          is_current_role: true,
          role_started_at: "2026-06-25",
          company: { name: "Attio", domain: "attio.com" },
          linkedin_url: "https://linkedin.com/in/elenaruiz",
        },
      },
      expect: { shouldVerify: true, realMin: 0.9 },
    },
  };
}

function buildEntries(fixtures: Record<string, Fixture>): BatchEntry[] {
  return Object.values(fixtures).map((f) => {
    const signal = normalizeSillageDetection(f.det, { data: f.lead });
    const sillageLead: EnrichedContact = {
      full_name: [f.lead.first_name, f.lead.last_name].filter(Boolean).join(" "),
      title: f.lead.position ?? undefined,
      company: { name: f.lead.company?.name ?? undefined, domain: f.lead.company?.domain ?? undefined },
      linkedin_url: f.lead.linkedin_url ?? undefined,
    };
    return { signal, sillageLead, warm: f.warm };
  });
}

// ---------- grading ----------

interface RunGrade {
  scores: Record<string, number>;
  max: Record<string, number>;
  total: number;
  totalMax: number;
  verifyCalls: string[];
  notes: string[];
  judgeNotes?: string;
}

function factorVal(a: any, key: string): number | undefined {
  return (a?.factors ?? []).find((f: any) => f?.key === key)?.value;
}

function gradeDeterministic(
  fixtures: Record<string, Fixture>,
  assessments: any[],
  verifyCalls: string[],
): { scores: Record<string, number>; max: Record<string, number>; notes: string[] } {
  const ids = Object.keys(fixtures);
  const byId = new Map<string, any>(assessments.map((a) => [a?.signal_id, a]));
  const notes: string[] = [];
  const scores: Record<string, number> = {};
  const max: Record<string, number> = {};
  const add = (k: string, pts: number, maxPts: number, note?: string) => {
    scores[k] = (scores[k] ?? 0) + pts;
    max[k] = (max[k] ?? 0) + maxPts;
    if (note && pts < maxPts) notes.push(`[-${maxPts - pts} ${k}] ${note}`);
  };

  // --- contract compliance (25) ---
  const missing = ids.filter((id) => !byId.has(id));
  add("contract", missing.length === 0 && assessments.length === ids.length ? 6 : 0, 6,
    missing.length ? `missing assessments: ${missing.join(", ")}` : `count mismatch: ${assessments.length}/${ids.length}`);

  const badFactors = assessments.filter((a) => {
    const keys = new Set((a?.factors ?? []).map((f: any) => f?.key));
    return !["real", "icp_fit", "urgent", "warm"].every((k) => keys.has(k)) ||
      (a?.factors ?? []).some((f: any) => !f?.detail);
  });
  add("contract", badFactors.length === 0 ? 5 : Math.max(0, 5 - 2 * badFactors.length), 5,
    `factor sets incomplete/uncited on: ${badFactors.map((a) => a?.signal_id).join(", ")}`);

  // mirrors runSillageAgent's cut: deferring siblings sink below non-deferring prospects
  const ranked = [...assessments].sort(
    (x, y) => (x?.defers_to ? 1 : 0) - (y?.defers_to ? 1 : 0) || composite(y?.factors ?? []) - composite(x?.factors ?? []),
  );
  const topMissingDrafts = ranked.slice(0, TOP_N).filter(
    (a) => !(a?.drafts ?? []).some((d: any) => d?.channel === "email" && d?.body) );
  add("contract", topMissingDrafts.length === 0 ? 4 : 0, 4,
    `top-${TOP_N} missing email drafts: ${topMissingDrafts.map((a) => a?.signal_id).join(", ")}`);

  const noEvidence = assessments.filter((a) => !(a?.evidence ?? []).length);
  add("contract", noEvidence.length === 0 ? 3 : 0, 3, `no evidence on: ${noEvidence.map((a) => a?.signal_id).join(", ")}`);

  add("contract", verifyCalls.length <= VERIFY_BUDGET ? 4 : 0, 4, `verify budget blown: ${verifyCalls.length}/${VERIFY_BUDGET}`);

  const unknownCalls = verifyCalls.filter((id) => !fixtures[id]);
  add("contract", unknownCalls.length === 0 ? 3 : 0, 3, `verify called with unknown signal_id: ${unknownCalls.join(", ")}`);

  // --- calibration (25) ---
  const verifiedSet = new Set(verifyCalls);
  for (const [id, f] of Object.entries(fixtures)) {
    const a = byId.get(id);
    const real = factorVal(a, "real");
    const urgent = factorVal(a, "urgent");
    if (f.expect.realExact !== undefined)
      add("calibration", real === f.expect.realExact ? 8 : 0, 8, `${id} real=${real}, must be exactly ${f.expect.realExact} (person left)`);
    if (f.expect.realMax !== undefined)
      add("calibration", real !== undefined && real <= f.expect.realMax ? 4 : 0, 4, `${id} real=${real}, must be ≤ ${f.expect.realMax}`);
    if (f.expect.realMin !== undefined && verifiedSet.has(id))
      add("calibration", real !== undefined && real >= f.expect.realMin ? 2 : 0, 2, `${id} real=${real}, verified clean, expected ≥ ${f.expect.realMin}`);
    if (f.expect.urgentMax !== undefined)
      add("calibration", urgent !== undefined && urgent <= f.expect.urgentMax ? 5 : 0, 5, `${id} urgent=${urgent}, thin signal must be ≤ ${f.expect.urgentMax}`);
  }
  // global: any prospect NOT verified (or verify said not-found) must have real ≤ 0.5
  const uncapped = ids.filter((id) => {
    const f = fixtures[id];
    const unverified = !verifiedSet.has(id) || !f.verify.found;
    const real = factorVal(byId.get(id), "real") ?? 0;
    return unverified && real > 0.5;
  });
  add("calibration", uncapped.length === 0 ? 4 : 0, 4, `unverified prospects with real > 0.5: ${uncapped.join(", ")}`);

  // --- triage efficiency (15) ---
  for (const [id, f] of Object.entries(fixtures)) {
    if (f.expect.mustNotVerify)
      add("triage", verifiedSet.has(id) ? 0 : 4, 4, `${id} is an obvious icp-zero but a credit was burned on it`);
    if (f.expect.shouldVerify)
      add("triage", verifiedSet.has(id) ? 2 : 0, 2, `${id} is a plausible winner but was never verified`);
  }
  const thinVerified = Object.entries(fixtures).some(([id, f]) => f.expect.urgentMax !== undefined && verifiedSet.has(id));
  add("triage", thinVerified ? 0 : 1, 1, "credit burned on the thin no-trigger signal");

  return { scores, max, notes };
}

const JUDGE_TOOL: Anthropic.Tool = {
  name: "grade",
  description: "Submit the rubric grades.",
  input_schema: {
    type: "object",
    properties: {
      why_now_quality: { type: "number", description: "0-20" },
      batch_judgment: { type: "number", description: "0-15" },
      notes: { type: "string", description: "2-4 sentences: what drove the grades, worst offender first" },
    },
    required: ["why_now_quality", "batch_judgment", "notes"],
  },
};

async function judge(
  client: Anthropic,
  batch: any[],
  assessments: any[],
  verifyCalls: string[],
  verifyResults: Record<string, unknown>,
) {
  const litmus = readFileSync(join(process.cwd(), "LITMUS.md"), "utf8");
  const prompt = `You are grading the output of a GTM scoring agent against its own product standards, quoted below.

<standards>
${litmus.slice(litmus.indexOf("### The one-sentence reason"), litmus.indexOf("### The drafts"))}
</standards>

<seller_context>${JSON.stringify(CTX)}</seller_context>

<batch_input>${JSON.stringify(batch)}</batch_input>

<verify_calls>${JSON.stringify(verifyCalls)}</verify_calls>

<verify_results>${JSON.stringify(verifyResults)}</verify_results>

<agent_output>${JSON.stringify(assessments)}</agent_output>

Grade two dimensions, harshly (a generic output deserves a low score):

1. why_now_quality (0-20): For each assessment — is why_now.trigger specific (dates, roles, numbers)? Is what_changed a real material change mined from the lead context, NOT a restatement of the raw signal? Is why_buying tied to what THIS seller sells? For thin signals (e.g. an 80-day-old newsletter click): does the output SAY PLAINLY there is no real trigger yet, instead of dressing the click up as one? Fabricated specifics are an automatic heavy penalty — but a fact is only fabricated if it appears in NONE of batch_input, verify_results, or seller_context.

2. batch_judgment (0-15): Two signals are from the same account (Ramp) — did the agent treat them as one account story (cross-reference, prioritize one, avoid two near-identical pitches), or as unrelated rows? Is the top-${TOP_N} diverse rather than a monoculture of one account? Do rank_reasons read like a sharp rep's judgment across the batch (comparative, decisive) rather than per-row boilerplate? Are drafts free of fabricated shared history or product claims outside seller_context?

Call the grade tool exactly once.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
    tools: [JUDGE_TOOL],
    tool_choice: { type: "tool", name: "grade" },
  });
  const tu = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  const g = (tu?.input ?? {}) as any;
  return {
    why_now_quality: Math.max(0, Math.min(20, Number(g.why_now_quality) || 0)),
    batch_judgment: Math.max(0, Math.min(15, Number(g.batch_judgment) || 0)),
    notes: String(g.notes ?? ""),
  };
}

// ---------- one eval run ----------

async function runOnce(client: Anthropic, fixtures: Record<string, Fixture>): Promise<RunGrade> {
  const entries = buildEntries(fixtures);
  const verifyCalls: string[] = [];
  const verifyResults: Record<string, unknown> = {};

  const stubVerify = async (input: Record<string, any>, verified: Map<string, EnrichedContact>) => {
    const id = String(input.signal_id ?? "");
    verifyCalls.push(id);
    const f = fixtures[id];
    const result = !f
      ? { found: false as const, note: "no FullEnrich match — treat real as unverifiable" }
      : f.verify.found
        ? { found: true as const, contact: f.verify.contact }
        : f.verify;
    verifyResults[id] = result;
    if (f && f.verify.found) verified.set(id, { ...f.verify.contact } as EnrichedContact);
    return JSON.stringify(result);
  };

  const { assessments } = await agentLoop(entries, CTX, TOP_N, { verify: stubVerify, feedback: [] });

  const det = gradeDeterministic(fixtures, assessments, verifyCalls);
  const batch = entries.map((e) => ({
    signal_id: e.signal.signal_id,
    signal: { ...e.signal, raw: undefined },
    sillage_lead_context: e.sillageLead,
    warm_path: e.warm,
  }));
  const j = await judge(client, batch, assessments, verifyCalls, verifyResults);

  const scores = { ...det.scores, why_now: j.why_now_quality, batch_judgment: j.batch_judgment };
  const max = { ...det.max, why_now: 20, batch_judgment: 15 };
  return {
    scores,
    max,
    total: Object.values(scores).reduce((a, b) => a + b, 0),
    totalMax: Object.values(max).reduce((a, b) => a + b, 0),
    verifyCalls,
    notes: det.notes,
    judgeNotes: j.notes,
  };
}

// ---------- main ----------

async function main() {
  const args = process.argv.slice(2);
  const runs = Number(args[args.indexOf("--runs") + 1]) || 2;
  const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "run";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const fixtures = buildFixtures();

  const grades: RunGrade[] = [];
  for (let i = 0; i < runs; i++) {
    const g = await runOnce(client, fixtures);
    grades.push(g);
    console.log(`\n=== ${label} run ${i + 1}/${runs}: ${g.total}/${g.totalMax} ===`);
    for (const k of Object.keys(g.scores)) console.log(`  ${k.padEnd(16)} ${g.scores[k]}/${g.max[k]}`);
    console.log(`  verify calls (${g.verifyCalls.length}): ${g.verifyCalls.join(", ") || "none"}`);
    for (const n of g.notes) console.log(`  ${n}`);
    if (g.judgeNotes) console.log(`  judge: ${g.judgeNotes}`);
  }

  const avg = grades.reduce((a, g) => a + g.total, 0) / grades.length;
  const avgBy: Record<string, number> = {};
  for (const k of Object.keys(grades[0].scores))
    avgBy[k] = grades.reduce((a, g) => a + (g.scores[k] ?? 0), 0) / grades.length;
  console.log(`\n### ${label}: avg ${avg.toFixed(1)}/${grades[0].totalMax} over ${runs} runs`);
  console.log(Object.entries(avgBy).map(([k, v]) => `${k}=${v.toFixed(1)}`).join("  "));

  const outDir = join(process.cwd(), "data/eval-results");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${label}.json`);
  writeFileSync(out, JSON.stringify({ label, avg, avgBy, grades }, null, 2));
  console.log(`saved ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
