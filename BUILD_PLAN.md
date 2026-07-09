# Litmus — Build Plan (v3, scoring pipeline)

Track 1 — Acquisition. Goal: **one pipeline, one demo path with a shallow and a deep cut**, all sponsors + Unipile load-bearing, zero fake numbers, frozen at 17:30. Two-round pitch: build ONE thing with a 90s round-1 cut and a deeper round-2 cut. Architecture in `ARCHITECTURE.md`, team rules in `WORKFLOW.md`.

## The product

Litmus scores Sillage's intent firehose into a ranked worklist with cited reasons, enriches the top contacts (FullEnrich), drafts the outreach, sends it multi-channel (Unipile), and renders the output into any sink (Slack demo). The score + reasoning (Anthropic) is the IP; everything else is pipes.

## Definition of done (17:30)

Live, from real Sillage data pulled this morning:
- A **ranked worklist** of scored signals, each with a one-sentence cited reason (the score, not a binary card).
- The top one **enriched** to a verified email + LinkedIn (FullEnrich).
- A **drafted** email + LinkedIn message (Claude/Fable).
- **One live send** via Unipile (email + LinkedIn message to an existing connection).
- The output **rendered in Slack** (Block Kit card in a thread).

## Guaranteed vs stretch (scope discipline — 4 integrations, protect the core)

**Guaranteed (build in this order):**
1. Sillage MCP → real signals for a top account + persona, pulled + cached this morning.
2. `normalize.ts` → canonical Signal/EnrichedContact (FullEnrich mapping now; Sillage mapping at 9:30).
3. FullEnrich enrich → verified email + LinkedIn on the top contacts.
4. `score.ts` → composite score + rank + cited reason (Anthropic, structured output).
5. Slack sink → ranked cards in a thread.
6. Unipile → one live send (email + LinkedIn to an existing connection).

**Stretch (only if ahead at 16:00):** HubSpot sink (App Card in a dev test account, else PATCH+Note) · live MCP-to-MCP agentic loop · Litmus exposed as an MCP tool · **Gradium voice** (phone channel — "Most Creative" + "Best use of Gradium").

## Roles

- **Pierre (heavy dev)** — the engine: Sillage MCP pull + `normalize.ts`, FullEnrich enrich wiring, `score.ts` (Fable loop + structured output), Unipile send, cache. Owns `src/*` except UI.
- **Oscar** — scoring rules + weights, curated account context, the demo signals (incl. the high-score hero + a killed false-positive), pitch, sponsor framing, keys at 9:00 (Sillage OAuth, Unipile trial).
- **Desiree (delivery)** — Slack sink + dashboard UI, demo path, round-1/round-2 script, timeboxing, rehearsal, freeze enforcement. Side challenges (LinkedIn/X/Gamma).

## Hour-by-hour (9:30 → 17:30)

| Time | Milestone | Owner |
|---|---|---|
| 9:00–9:30 | Keys: FullEnrich Bearer; Sillage MCP OAuth (`claude mcp add ...`), seed workspace if empty, pull + cache real signals; Unipile 7-day trial, connect an aged Gmail + LinkedIn via hosted wizard. | Oscar / Pierre |
| 9:30–11:00 | `normalize.ts`: confirm Sillage field paths against live payload; FullEnrich mapping (already written) tested on the free contact. Canonical Signals flowing. | Pierre |
| 11:00–13:00 | `score.ts`: Fable loop, deterministic factor extraction + reasoning, structured `ScoredSignal` out, `web_search` corroboration. A/B Fable vs Sonnet on one signal. | Pierre + Oscar |
| 13:00–13:30 | Lunch / integrate: real signal → normalize → enrich → score → ranked list, end to end. | all |
| 13:30–15:00 | Slack sink (Block Kit cards) + dashboard worklist. Curate demo signals. Unipile send wired to a button. | Desiree + Pierre |
| 15:00–16:00 | **Pre-warm cache** built + wired. Demo runs from cache. Freeze round-1 cut. Gradium voice IF ahead. | Pierre |
| 16:00–16:30 | Round-2 depth: warm-intro beat + agnostic output (HubSpot sink or live MCP loop) as the flourish. | Pierre |
| 16:30–17:30 | FULL FREEZE. Cache everything. Rehearse round-1 (90s) x3, round-2 x2. | all |

## Stack

- Node + TypeScript, one process (engine + API + dashboard + Slack action handler).
- `@anthropic-ai/sdk` (Fable), `unipile-node-sdk` (or raw REST in `src/unipile.ts`), `dotenv`.
- Sillage via MCP (pull through Claude Code, cache). FullEnrich REST (`src/fullenrich.ts`, written). Slack incoming webhook.
- Flat JSON for relationships + mocks + pre-warm cache. No database.

## First tasks when the clock starts

- [ ] `npm i`; `.env` from `.env.example`.
- [ ] Sillage MCP connect + pull real signals to cache.
- [ ] Confirm Sillage payload → finish `normalize.ts` field paths.
- [ ] Enrich top contacts (FullEnrich, free test contact first).
- [ ] `score.ts` Fable loop + structured output.
- [ ] Slack sink renders ranked cards.
- [ ] Unipile: connect accounts, one live send.
- [ ] Pre-warm cache, freeze, rehearse.
