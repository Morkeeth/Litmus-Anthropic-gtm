# DEMO BRIEF — read once before Q&A (5 min format: 1.5 pitch / 1.5 video / 2 Q&A)

## 1. Product in one breath

Everyone else builds signal sources. **Litmus is the scoring layer between the signal firehose and the action.** It scores every intent signal against what *this specific seller* sells, kills false positives with independent verification, and outputs only the top 5–10 — each with a cited why-now and ready-to-send drafts, behind a human approval gate. Dumping 200 "hot leads" recreates the problem; the cut IS the product.

## 2. Technical facts to know cold

**The score.** `score(signal) → 0–100` from four factors, each 0–1 and each citing its evidence:
- `real` (gate) — is the person verifiably in that role NOW? The false-positive kill.
- `icp_fit` (gate) — matches this seller's ICP?
- `urgent` (boost) — is now the moment? Dominant boost.
- `warm` (boost) — do we have a way in?

Formula: `base = 100 × real × icp_fit`, then `score = base × (0.4 + 0.35·urgent + 0.25·warm)`. Gates are multiplicative, so a dead or out-of-ICP lead scores ~0 no matter how urgent. **The model never outputs the score** — it emits factors via forced structured output (tool_choice), and the composite is recomputed in code. Auditable math, not vibes.

**LITMUS.md is the product.** The whole scoring + drafting brain is one versioned, templated system prompt loaded by `src/score.ts`. Everything else is pipes.

**The agent loop** (`lib/agent-loop.ts`, Flow B). Not a fixed pipeline — a model-driven tool-use loop: a batch of Sillage detections comes in, the model triages on fit/urgency first, then spends FullEnrich credits **only on candidates that could plausibly rank** (capped verify budget), then emits one strict `emit_ranked` call for the whole batch. Cost-aware agency, not enrich-everything.

**The independence rule.** `real` is verified with FullEnrich, never with Sillage data — verifying a Sillage signal with Sillage is circular. FullEnrich is the independent witness. One nuance: Sillage is fresher on job changes, so a lagging FullEnrich title isn't a contradiction; `is_current_role: false` (person left) is the hard kill.

**It's evaluated, not vibed.** Offline eval harness with an LLM judge grading 5 dimensions (contract, calibration, triage, why-now, batch judgment). Six prompt iterations took the agent from **86.5 → 94/100** (`data/eval-results/`).

**Learning loop.** 👍/👎 from the dashboard → `data/feedback.jsonl` → injected back into the prompt as few-shot examples next run. A suppression ledger stops re-surfacing the same lead (cooldown).

**Source-agnostic in and out.** Five input flows share one scorer: FullEnrich ICP search (A), Sillage agent loop (B), CSV/CRM (C), reverse-email (D), HubSpot (E). Outputs are pluggable sinks: dashboard, Slack, Unipile send (email + LinkedIn), HubSpot.

**Stack.** Next.js dashboard + headless TypeScript engine (`src/`). Model: Claude Sonnet 5 (cheap enough to score volume). Demo is wifi-proof: real API responses pre-warmed to committed cache.

## 3. Integrations at a glance (one breath each)

- **Sillage — the intent firehose.** JSON-RPC client to their MCP server (Bearer key, no server-side OAuth): pull signal batches (`list_signals`/`get_signal`), seed workspaces (persona, top accounts, agents). Batches feed the agent loop; per the independence rule Sillage data never verifies itself.
- **FullEnrich — the independent witness + contact source.** Cheap sync lookups (`people/lookup`/`search`) answer "is this person really there NOW" and gate `real`; the async waterfall (bulk enrich, reverse-email) gets emails/phones — spent only on ranked winners, and in the agent loop only through the budgeted `verify_person` tool.
- **Anthropic — the judgment layer.** LITMUS.md loads as the system prompt; Sonnet 5 is called with forced tool use so it can only emit cited factors/drafts/evidence as strict JSON (score recomputed in code). Same prompt drives the agent loop's triage→verify→`emit_ranked` turns, the filter-derivation call in Flow A, and the eval's LLM judge.

## 4. Per-judge angles

- **FullEnrich judge:** you're our *ground truth* — the independent verification layer, plus the database (people/search with enum-free filters, bulk enrich with `custom` passthrough for correlation, reverse-email lookup). And we're credit-respectful: the agent triages before it spends a lookup.
- **Sillage judge:** you're the intent firehose we make actionable — and we encode that Sillage beats FullEnrich on freshness for job changes (precedence rule in the prompt). Integrated both via MCP and the Bearer JSON-RPC API.
- **Anthropic judge:** prompt-as-product (LITMUS.md), forced structured output so the UI renders JSON never prose, an agentic tool-use loop with a tool budget, an offline eval harness with an LLM judge, and a human-feedback few-shot loop. The score itself is deterministic code — the model only judges factors and cites evidence.

## 5. Next steps (say these, they show judgment)

1. **Per-seller weight tuning** — the 0.4/0.35/0.25 weights are already parameterized; learn them from the 👍/👎 feedback instead of hand-setting.
2. **Graduated autonomy** — above a score threshold, auto-send with the approval gate becoming a review-after; below it, draft-only. Trust is earned per seller.
3. **Real relationship graph** — replace the heuristic warm-path lookup with actual LinkedIn/email graph via Unipile.
4. **More sources/sinks** — the scorer is the constant; Salesforce, Attio, webhooks are just adapters.

## 6. What one scan costs (dashboard "run live ↻", top 5)

One scan = 1 filter-derivation call + FullEnrich search (10 profiles) + 10 score calls + enrich the 5 winners for email + phone.

| Leg | Cost | Basis |
|---|---|---|
| Anthropic (11 Sonnet 5 calls) | **~$0.30** | Measured: 3,540 input tokens per score call on the real prompt, ~1.2k out ($3/$15 per MTok; intro $2/$10 → ~$0.20) |
| FullEnrich search | ~$0.14 | 10 results × 0.25 credits, at ~$0.055/credit ($55/mo = 1,000 credits) |
| FullEnrich enrichment | $0.28 – $3.03 | 5 winners × (1 credit email + 10 credits phone), **charged only on hit** |
| Sillage | ~$0 marginal | Flat subscription, calls aren't metered |

**Total: ~$0.70 per scan with emails only; ~$3.50 if every phone hits.** The soundbite: *the intelligence costs cents — one phone number costs 18× one scored lead.* That asymmetry is the whole design: triage and score first, spend enrichment credits only on ranked winners (and in the agent loop, only through the budgeted `verify_person` tool at $0.014 a check).

## 7. Hard questions — suggested answers

- **"Why can't I do this in Clay?"** Clay gives you a spreadsheet of enrichments; you still decide. Litmus is opinionated: a ranked cut with an auditable score, a defensible why-now, drafts, and a feedback loop that learns your taste.
- **"How do you stop the LLM making up scores?"** It can't emit one. It emits four cited factors through a forced JSON schema; the composite is computed in code. Prompt forbids uncited facts; unverifiable → `real: 0`, "false negative is cheaper than a burned touch."
- **"What's real vs mocked in the demo?"** The pipeline runs live end-to-end with keys ("run live ↻" hits `/api/run`). The video/dashboard fallback uses committed cache of real API responses — hackathon-wifi insurance, not fake data.
- **"Unit economics?"** A full scan is ~$0.70–3.50 all-in (see §6): Sonnet 5 scoring is ~3¢/lead; the expensive resource is FullEnrich phone credits (~$0.55 each), which is exactly why the agent triages before verifying.
- **"What's the moat?"** LITMUS.md + the eval harness + accumulated per-seller feedback data. Signal sources commoditize; the scoring layer that knows *your* taste doesn't.
