# Litmus — Build Plan (v2, two-round pitch)

Goal for Thursday: **one primitive, one demo path with a shallow and a deep cut**, all three sponsors load-bearing, zero fake numbers, frozen at 17:30. Format is a **two-round live demo** (everyone pitches once; finalists pitch again), so we build ONE thing that has a 60s round-1 cut and a deeper round-2 cut. Architecture detail in `ARCHITECTURE.md`.

## Definition of done (the only bar that matters)

By 17:30 we can, live, take a signal and return a **2×2 verdict** (truth × warmth) with an evidence chain a skeptical CRO cannot poke a hole in:
- **REAL + COLD** — verifiable person, current role, corroborated, no known path → verified cold outreach.
- **NOISE** — role no longer exists / person left → drop, with proof. **(round-1 hero: "hot signal, left four months ago, here's the record.")**
- **REAL + WARM** — a champion move: person verified in new seat + we hold a relationship edge → warm intro via X. **(round-2 depth.)**
- **UNPROVEN** — real person, one weak signal → watch.

## Scope: in vs out

**In:** the `verify()` primitive (truth + warmth); FullEnrich sync search + enrich; **seeded** relationship DB (read-only, one lookup tool); 3–4 curated demo signals pre-warmed; single-page UI with 2×2 verdict cards; pre-warm cache.

**Out:** real CRM read/write; any actual sending; real-time Sillage as a dependency (mock it); crawling/building a relationship graph (seed only); auth, multi-user, persistence beyond JSON/SQLite cache; batch/scale.

## The two-round mapping (one build, two cuts)

- **Round 1 (everyone, ~60–90s):** problem → solution → the **truth axis** and the **NOISE gotcha**. Bulletproof, rehearsed, cache-backed. This alone must be able to win.
- **Round 2 (finalists, deeper):** the **warmth axis** — the champion who moved, verified and routed to a warm intro — plus "one engine, plug it on any surface" (CRM Truth as the second surface, spoken/shown lightly). This is where ambition pays; it only ships if round-1 is frozen solid first.

## Architecture (summary — full in ARCHITECTURE.md)

```
signal ─▶ Claude/Fable agent loop ─▶ { truth, warmth, action, evidence[] } ─▶ UI cards
             ├─ search_company / search_people / enrich_contact   → FullEnrich (truth)
             ├─ lookup_relationship(person)                       → Relationship DB (warmth, seeded)
             └─ find_second_signal                                → corroboration
```
Forced structured JSON out. Loop capped ~5 tool calls. Demo reads the pre-warm cache; one live call held ready.

## Roles

- **Pierre (heavy dev)** — owns the engine: FullEnrich client, the Fable agent loop + tool wiring, the seeded relationship DB + `lookup_relationship`, structured verdict output, the pre-warm cache. The hard core. Guards risks #1–3.
- **Oscar** — architecture + verdict logic (the per-axis rules and citations), the demo signals (incl. the recognizable NOISE gotcha and the champion beat), pitch narrative, sponsor-fit framing. Guards risk #4.
- **Desiree (delivery)** — owns "done by 17:30": the demo path + UI (2×2 cards + evidence), the round-1/round-2 script split, timeboxing, rehearsal, and keeping scope frozen. Guards risks #5–6.

## Hour-by-hour (9:30 → 17:30)

| Time | Milestone | Owner |
|---|---|---|
| 9:00–9:30 | Grab FullEnrich + Sillage keys at kickoff. Confirm FullEnrich base URL + auth. Lock mock signal schema (incl. champion type). | all |
| 9:30–11:00 | FullEnrich client: sync `search_company` + `search_people` return real data. `enrich_contact` poll wrapper. Credits logged. | Pierre |
| 9:30–11:00 | Seed relationship DB (edges: person/company/type/strength/as_of) from a small CSV + a couple of champion-history rows. `lookup_relationship` tool. | Pierre |
| 11:00–13:00 | Fable verify loop: tools wired (FullEnrich + relationship), **two-axis structured JSON verdict**, evidence chain, explicit per-axis rules. | Pierre + Oscar |
| 13:00–13:30 | Lunch / integrate: loop runs real FullEnrich + relationship end-to-end on one signal. | all |
| 13:30–15:00 | Curate 3–4 demo signals (REAL+COLD, NOISE gotcha, REAL+WARM champion, UNPROVEN). UI: 2×2 verdict cards + evidence. | Oscar + Desiree |
| 15:00–16:00 | **Pre-warm cache built and wired.** Demo runs entirely from cache. Freeze round-1 cut first. MCP wrapper (~50 lines, same verify fn) if on schedule — first cut if hot. | Pierre |
| 16:00–16:30 | Swap in live Sillage feed if we have a key, else polish the mock path. Wire the round-2 depth beat. | Pierre |
| 16:30–17:30 | Freeze build. Cache everything. Rehearse round-1 (60s) x3 and round-2 depth x2. | all |

## Stack

- Node + TypeScript, one small server.
- `@anthropic-ai/sdk`, model **Fable** (latency + verdict quality; fall back to Sonnet if quality dips on the two-axis reasoning).
- FullEnrich via REST (`https://app.fullenrich.com/api/v2`, `Authorization: Bearer`) — **confirm endpoints at kickoff**.
- Relationship DB: SQLite (or flat JSON if faster to seed).
- One static HTML page for the verdict cards.
- `cache/` dir of JSON for the pre-warm.

## First tasks when the clock starts

- [ ] `npm init`, add `@anthropic-ai/sdk`, dotenv, sqlite (or none if JSON).
- [ ] `.env`: `ANTHROPIC_API_KEY`, `FULLENRICH_API_KEY`, `SILLAGE_API_KEY` (if issued).
- [ ] `src/fullenrich.ts` sync search + enrich; test against one real company.
- [ ] `src/relationship.ts` seed + `lookup_relationship`.
- [ ] `src/verify.ts` Fable loop, five tools, two-axis structured output.
- [ ] Curate demo signals in `mock/signals.json` (add champion + warm-path fields).
- [ ] Pre-warm cache script.
- [ ] Single-page 2×2 UI.
- [ ] Freeze round-1, then rehearse both cuts.
