# Litmus — Architecture (v3, scoring pipeline)

For the team (Oscar / Pierre / Desiree). Track 1 — Acquisition. Companion to `BUILD_PLAN.md`.
Scoped to a hard 17:30 freeze and a two-round pitch (everyone once; finalists again).

## Thesis in one line

Sillage surfaces a lot of intent. Litmus is the brain that decides what to do with it: score every signal, rank the worklist, explain why, and fire the action. Everything else is pipes; the score + reasoning is the product.

## The pipeline

```
CRM (HubSpot/Salesforce) ──┐  provides the account list to watch (prod; workspace pre-seeded for demo)
                           ▼
   SILLAGE (MCP) ─────────────▶ intent firehose: job changes, champions, competitor moves, keywords...
                           │
                           ▼
   FULLENRICH ───────────────▶ reachability: verified work email + mobile (async waterfall)
                           │
                           ▼
   LITMUS SCORE (Anthropic) ─▶ score 0-100 = f(real, warm, urgent, icp_fit) + ranked + cited reason   ◀── THE IP
                           │
                           ▼
   ACTION (Unipile) ─────────▶ drafted email + LinkedIn message, sent on behalf of the rep
                           │
                           ▼
   OUTPUT (agnostic sink) ───▶ Slack (demo) · HubSpot / Salesforce (adapter) · dashboard
```

The CRM appears at both ends: it *feeds* the account list into Sillage (prod concern — not built for the demo, the workspace is pre-seeded) and it's *one of* the output sinks. We do not build CRM→Sillage ingestion today.

## The core: the scoring engine

One function is the whole product:

```
score(signal) -> { score, rank_reason, factors, enriched, drafts, warm_path?, evidence[] }
```

- **Composite score 0-100** from four factors, each cited, none a black box:
  - `real` — is the person actually in that role now? (FullEnrich lookup — the anti-false-positive check, the old Litmus verify)
  - `warm` — do we have a path in? (seeded relationship DB — drives warm-intro vs cold)
  - `urgent` — how fresh / time-boxed is the signal? (job change inside 30-90d window scores high)
  - `icp_fit` — does the account/persona match? (Sillage persona + firmographics)
- **Anthropic does the reasoning**, not just a weighted sum: the model reads the aggregated account intel (all of the account's Sillage signals, job posts, content engagement) and writes the `rank_reason` — the one sentence a rep reads to decide. Forced structured output; the UI renders from JSON.
- **The prompt is the product: `LITMUS.md`.** It is the system prompt `score.ts` loads. Templated slots: `{{CLIENT_CONTEXT}}`, `{{SIGNAL}}`, `{{ENRICHED_CONTACT}}`, `{{WARM_PATH}}`, `{{FEEDBACK_EXAMPLES}}`. Treat edits to it as changes to core IP. Composite: `real` and `icp_fit` are gates, `urgent`/`warm` are boosts (a dead or out-of-ICP prospect scores ~0 by design).
- **Ranked worklist out, filtered to top 5-10** — never dump all scored data (that recreates the firehose the rep is drowning in). The cut is the value.

### CLIENT CONTEXT — set up once (onboarding)

The rep fills `client-context.md` once (template: `client-context.example.md`): what they sell, ICP + disqualifiers, competitors, proof assets, tone of voice, a real message that worked. It grounds `icp_fit` scoring and the draft tone — a prospect is only "good" relative to what THIS seller offers. Injected as `{{CLIENT_CONTEXT}}`. Not raw data (no normalization) — it's the grounding layer.

## Action layer (Unipile)

- One API, two channels: `email.send` (Gmail) + `messaging.sendMessage` (LinkedIn). Node SDK.
- Auth: our `X-API-KEY` + a hosted-auth wizard link to connect the rep's Gmail/LinkedIn (one round-trip, Unipile owns the provider OAuth).
- **Demo constraint:** live-send email + a LinkedIn message to an *existing connection* on an aged account. Cold LinkedIn invites are "prod-supported", not live-demoed (LinkedIn blocks fresh accounts).

## Output layer (agnostic sinks)

The engine emits a neutral `ScoredSignal`; a thin adapter renders it per destination. Sinks are pluggable and independent — adding one never touches the engine.

- **Slack** — Block Kit card in a thread-per-rep. 5-min setup, zero gating. **The guaranteed demo sink.**
- **HubSpot** — stretch. Modern App Card in a free Developer Test Account; degrade to `PATCH` custom properties + a Note (works on any free portal, no Enterprise). Classic CRM cards are dead (deprecated Jun 2025) — do not build them.
- **Salesforce** — named in the pitch as "same adapter pattern"; not built today.
- **Dashboard** — our own page, the ranked worklist. Also the stage view + human approval gate.

## Product surface: headless engine, pluggable sinks

Litmus is a layer, not a destination. `score()` is a function; the dashboard, the Slack sink, the CRM adapters, and an optional MCP tool are all thin doors over it. One Node/TS process serves engine + API + dashboard. Localhost + committed cache is the demo substrate (wifi-proof); a public URL (Railway/Fly, not serverless — the enrich poll runs 30-90s) is optional if we're ahead.

## Data flow / caching (the demo must never hang)

- Pull real Sillage signals + FullEnrich enrichments once, **pre-warm to disk before the pitch.** The dashboard and Slack demo read cache — instant, wifi-proof, still real data. One live call held ready if a judge pushes.
- Independence rule: score `real` with **FullEnrich**, never `sillage_v2_enrich_company` (circular).

## Integrations — verified facts

- **Sillage MCP:** `https://api.getsillage.com/api/mcp/v2`, streamable HTTP, OAuth 2.1, workspace-scoped, no API key. Tools: `sillage_v2_list_signals`, `sillage_v2_get_signal`, `sillage_v2_get_company_mapping`; seed via `upsert_persona`/`add_top_accounts`/`create_agent`/`launch_signal_run`. OAuth is interactive-client friendly (Claude Code) → pull + cache; our server stays off the OAuth path.
- **FullEnrich:** `https://app.fullenrich.com/api/v2`, `Bearer`. Sync `people/lookup`+`company/lookup` (profiles, 0.25cr/result). Async `contact/enrich/bulk` (email/phone, 30-90s poll). Free test contact: Grégoire Démogé @ fullenrich.com. Client written (`src/fullenrich.ts`).
- **Unipile:** `https://{DSN}/api/v1`, `X-API-KEY`. `unipile-node-sdk`. 7-day free trial, no CC. `POST /emails`, `POST /chats/{id}/messages`, hosted auth `POST /hosted/accounts/link`.
- **Anthropic:** Fable loop (A/B vs Sonnet at 11:00). `web_search` server tool for corroboration. Structured outputs for the score JSON.

## Human gate + learning loops

The engine proposes; the rep disposes; outcomes tune the engine.

- **Approval gate (before send).** Every draft carries `approved?`. Unipile fires only after the rep's 👍. This is the credible GTM model (human owns the send) and the first feedback signal. A 👎 can carry a reason.
- **Output eval loop** (`feedback.ts`, `data/feedback.jsonl`). 👍/👎 + reason is logged and the recent set is injected into `LITMUS.md` as `{{FEEDBACK_EXAMPLES}}`, so the scorer stops repeating rejected patterns. No training — few-shot. **Demoable:** reject a prospect for "wrong persona", re-run, watch it drop. This proves the prompt is data-driven.
- **Client feedback loop** (roadmap-real). Unipile inbound webhooks fire on prospect replies → `client_reply` feedback → outcome-weight the score in prod. Wire if ahead; otherwise narrate — it's the long-term moat.

## Output destinations (agnostic)

"We just create an output." Slack for the demo; the same `ScoredSignal` renders into HubSpot / Salesforce, or any agent window the rep runs (Claude, Hermes, etc.). The engine never knows or cares where it lands.

## Risk register

| # | Risk | Mitigation | Owner |
|---|------|------------|-------|
| 1 | 4 integrations = over-scope | Ruthless guaranteed/stretch split (see BUILD_PLAN). FullEnrich client already written; Slack + Unipile ~15min each. | Desiree |
| 2 | Sillage OAuth from our server | Pull + cache via Claude Code; server never holds the token. | Pierre |
| 3 | Enrich latency on stage | Pre-warm cache. | Pierre |
| 4 | Unipile LinkedIn on fresh account fails | Aged account, message existing connection; cold invite = pitch-only. | Oscar |
| 5 | HubSpot account/tier fights us | Slack is primary; HubSpot degrades to PATCH+Note; never on critical path. | Oscar |
| 6 | "Just glue" critique | Demo shows the SCORE and the REASONING, not connections. The engine is the star. | Oscar |
| 7 | Two-round pitch tempts two demos | One build, two cuts: R1 = scored worklist + one live send; R2 = warm-intro depth + agnostic output + voice stretch. | Desiree |

## Side challenges (do not bloat core)

- LinkedIn + X posts (near-free) · Best use of Gamma (build the deck / per-account brief in Gamma).
- **Gradium voice (gradium.ai)** — stretch: a voiced account briefing or AI voice call = the *phone* channel in Track 1, wins "Most Creative" + "Best use of Gradium". Only if core lands by 15:00. Clearly-marked module, never on the critical path.
