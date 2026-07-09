# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Litmus (v3): the scoring layer for GTM intent, built for the Station F Agentic GTM Hackathon (July 9, 2026, Track 1 — Acquisition). It scores an intent firehose against what a specific seller sells, ranks the top 5–10 prospects with a cited reason, drafts the outreach, and fires the action behind a human approval gate.

```
CRM ─▶ SILLAGE (MCP) ─▶ FULLENRICH ─▶ LITMUS SCORE (Anthropic) ─▶ ACTION (Unipile) ─▶ Slack / HubSpot / dashboard
       intent           phone+email    score 0-100 + reason        email + LinkedIn     agnostic sinks
```

Doc map: `ARCHITECTURE.md` (authoritative design), `CONTEXT.md` (living team-state: status, keys, help-wanted), `WORKFLOW.md` (team rules), `BUILD_PLAN.md` (day plan), `DEMO_BRIEF.md` (pre-Q&A crib sheet for the 5-min pitch). The original "verify loop" concept was retired in v3 — its anti-false-positive check lives on as the `real` scoring factor.

## Commands

```
npm install
cp .env.example .env      # fill keys
npm run dev               # Next.js on http://localhost:3000
npm run build             # must pass before pushing — main is always demoable
npm run lint
npm run cli               # terminal door: litmus brief / score / sources (bin/litmus.ts)
npm run mcp               # MCP server door for other agents (bin/litmus-mcp.ts, stdio)
npx tsx scripts/eval-agent-loop.ts [--runs 2] [--label name]   # offline eval of the agent loop
npx vercel --prod         # deploy (or push to main; auto-deploys)
```

No test suite, but the agent loop has an offline eval (see below). Routes: `/` landing, `/onboarding` (client context, set once), `/dashboard` (the morning brief — loads mock, "run live ↻" hits `/api/run`).

Env keys (`.env`, gitignored): `FULLENRICH_API_KEY` + `ANTHROPIC_API_KEY` (needed for live run), `UNIPILE_DSN`/`UNIPILE_API_KEY` (send), `SLACK_WEBHOOK_URL` (sink), `HUBSPOT_TOKEN` (stretch), `LITMUS_MODEL` (default `claude-sonnet-5`). Sillage has no key — OAuth via `claude mcp add --transport http sillage https://api.getsillage.com/api/mcp/v2`.

## Architecture

**`LITMUS.md` is the product.** It's the scoring + drafting system prompt that `src/score.ts` loads, with templated slots (`{{CLIENT_CONTEXT}}`, `{{SIGNAL}}`, `{{ENRICHED_CONTACT}}`, `{{WARM_PATH}}`, `{{FEEDBACK_EXAMPLES}}`, `{{CORROBORATION}}`). Treat edits to it as changes to core IP. The agent loop reuses the same prompt and appends its AGENT MODE batch-triage section at runtime (`lib/agent-loop.ts`).

Source flows into one scorer (all funnel through score → suppress → top-N):
- **Flow A (works now, no Sillage):** `lib/pipeline.ts` `runIcpWorkflow` — client context → derive FullEnrich `people/search` filters (Claude call) → score → rank → enrich winners. Backs `/api/run`.
- **Flow B (the agent loop):** `lib/agent-loop.ts` — a batch of Sillage detections goes into a model-driven tool-use loop: triage on icp_fit and signal strength first, spend FullEnrich credits only on plausible winners via the `verify_person` tool (budgeted), then one strict `emit_ranked` call for the whole batch. Same-account siblings fold into a carrier via `defers_to`.
- **Flows C/D/E (source-optional, `lib/pipeline.ts`):** CSV/CRM contacts, email list via FullEnrich reverse-lookup, HubSpot contacts (read-only).

Layout:
- `app/` — Next.js app (landing, onboarding, dashboard; Editorial Brief design, Fraunces + Plex Mono). API routes: `/api/run` (live Flow A), `/api/prospects` (mock fallback, always demoable), `/api/feedback` (👍/👎 loop), plus send/deliver/persona/voice-brief helpers.
- `lib/` — `pipeline.ts` (flows A/C/D/E), `agent-loop.ts` (Flow B), `ledger.ts` (suppression: surfaced/sent/declined cooldowns so the same lead doesn't reappear daily; `data/ledger.jsonl`).
- `src/` — the headless engine: `score.ts` (the Anthropic scoring call), `fullenrich.ts` (verified v2 client), `normalize.ts` (vendor JSON → canonical types), `sillage.ts`, `relationship.ts` (warm paths), `unipile.ts` (send), `sinks.ts` (pluggable outputs), `feedback.ts`, `types.ts` (the shared contract — frozen during the hackathon; changing it requires the whole team).
- `bin/` — `litmus.ts` (CLI) and `litmus-mcp.ts` (MCP server): two more doors over the same engine.
- `scripts/eval-agent-loop.ts` — offline eval harness for Flow B: fixed batch from cached Sillage payloads, `verify_person` stubbed from fixtures (zero FullEnrich credits), graded by deterministic checks + an LLM judge. Results in `data/eval-results/` (baseline 86.5 → final 94).
- `mock/` — `signals.json`, `scored.json`, `relationships.json`. The dashboard's wifi-proof fallback.
- `data/` — `feedback.jsonl` (injected back into the prompt as few-shot `{{FEEDBACK_EXAMPLES}}`), `ledger.jsonl`, `eval-results/`.
- `client-context.example.md` — template for the seller's grounding context (what they sell, ICP, tone).

## Scoring model (the core contract)

`score(signal) → { score 0-100, rank_reason, why_now, factors, drafts, evidence[] }`. Three factors, each cited: `real` and `icp_fit` are **gates** (dead or out-of-ICP scores ~0), `warm` is the **boost**: `score = 100·real·icp_fit·(0.4 + 0.6·warm)`. `warm` is a composite the model blends and cites — `0.55·relationship_edge + 0.30·signal_strength + 0.15·corroboration` (way-in + how strong a signal Sillage surfaced + how many independent signals stack). We dropped a standalone `urgent`/recency factor: Sillage surfaces signals within a day, so freshness is constant and can't rank. **The model never emits the composite** — it emits factors via forced tool use and the score is recomputed in code (`composite()` in `score.ts` / agent-loop). `why_now` is the pinpointed trigger/what-changed/why-buying triple. The UI renders from JSON, never prose. Output is always cut to top 5–10; dumping everything recreates the firehose. The dashboard/CLI also show the score as a litmus reading (ACID = reactive, act now / NEUTRAL / BASE = inert, skip — pH-styled, on brand).

## Rules that aren't obvious from the code

- **Raw vendor JSON never reaches the model.** `normalize.ts` maps Sillage/FullEnrich payloads into the canonical types first; `raw` is kept only for the evidence chain.
- **Independence rule:** score `real` with FullEnrich, never `sillage_v2_enrich_company` — verifying a Sillage signal with Sillage data is circular.
- **Data precedence (agent loop):** Sillage is fresher than FullEnrich on recent job changes — a lagging FullEnrich title is expected lag, not a contradiction. But `is_current_role: false` means the person LEFT: `real = 0` exactly, no hedging.
- **Tune the agent prompt against the eval.** Before changing LITMUS.md's scoring/agent sections, run `scripts/eval-agent-loop.ts` for a baseline, then re-run with a label and compare in `data/eval-results/`.
- **FullEnrich search filters:** only enum-free filter keys (`current_position_titles`, `person_locations`, `current_company_names`, `current_company_headcounts`) — seniority/industry enums throw `error.filters.enum.invalid`. Filter objects are `{ value, exact_match?, exclude? }`.
- **File reads use `process.cwd()`** (Next-safe), not module-relative URLs, in code that runs inside the Next.js app.
- **Sillage OAuth stays off the server.** Pull + cache signals via Claude Code (MCP, interactive OAuth); the server only reads cache or uses the Bearer-key JSON-RPC client.
- **The demo must never hang:** pre-warm real API responses to disk before pitching; dashboard and sinks read cache. The built cache **is committed** (it's the wifi-proof demo data), unlike `.env`. The agent loop has a hard `MAX_TURNS` cap for the same reason.
- **Unipile demo constraint:** live-send email + LinkedIn message to an *existing connection* on an aged account only; cold LinkedIn invites are pitch-only.

## Team workflow (hackathon rules, see WORKFLOW.md)

Trunk-based on `main`; `main` is always demoable (`clone && npm i && npm run dev` must work at any minute). Commit every 20–30 min, push immediately, plain present-tense messages. `src/types.ts` is the frozen shared contract. Respect the ownership map in WORKFLOW.md before touching another owner's files.

Note: the GitHub repo was renamed to `Morkeeth/Litmus-Anthropic-gtm` (old `Antropic` URL still redirects) — update your remote with `git remote set-url origin https://github.com/Morkeeth/Litmus-Anthropic-gtm.git`.
