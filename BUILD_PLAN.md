# Litmus — Build Plan (initial version)

The goal for Thursday is one feature, one demo path, both sponsors load-bearing, zero fake numbers. This plan describes the **initial version**: the smallest thing that makes a room of sales people nod.

## Definition of done (the only bar that matters)

At 18:00 we can show three signals side by side and, for each, a verdict with an evidence chain that a skeptical judge cannot poke a hole in:
- one **REAL** (verifiable person in a real role, corroborated),
- one **NOISE** (role no longer exists, or company unverifiable),
- one **NEEDS A SECOND SIGNAL** (real person, no corroboration yet).

The moment that wins: "this signal looks hot, but the person left that company four months ago. Noise. Here is the proof."

## Scope: in vs out

**In (build this):**
- A single verification loop: signal in, verdict + evidence out.
- FullEnrich integration on the synchronous search endpoints.
- Three curated demo signals, pre-warmed and cached.
- A clean single-screen UI: the three verdict cards with evidence chains.

**Out (do not build):**
- Real CRM read or write.
- Outreach or sending of any kind.
- Real-time Sillage ingestion as a dependency (mock it, swap if a key appears).
- Auth, accounts, multi-user, persistence beyond a JSON cache.
- Batch or scale. Three signals is the demo.

## Architecture

```
signal.json ─▶ verify loop (Claude agent) ─▶ verdict + evidence ─▶ UI cards
                     │
                     ├─ tool: search_company(name|domain)   FullEnrich /company/search  (sync)
                     ├─ tool: search_people(company, role)   FullEnrich /people/search   (sync)
                     └─ tool: enrich_contact(person)         FullEnrich enrich (poll wrapped inside)
```

- **Brain:** one Claude agent loop (Sonnet). FullEnrich calls exposed as tools. Cap ~5 tool iterations to bound latency.
- **Output:** forced structured JSON `{ verdict, confidence, evidence[] }`. The UI renders from JSON. Never parse prose live.
- **Verdict rules (explicit, not vibes):**
  - company unverifiable -> `NOISE`
  - person not found in the claimed role now -> `NOISE`
  - person confirmed, no corroborating second signal -> `NEEDS A SECOND SIGNAL`
  - person confirmed + corroboration -> `REAL`
  - each verdict must cite the exact FullEnrich fields that drove it.

## The two hard risks and their fixes

1. **Sillage has no public API.** Build against `mock/signals.json` from minute zero. Treat a live Sillage feed as a swap-in, never a dependency. If their API is flaky at demo time, we demo off the mock and it is invisible.
2. **A live enrichment call is slow or empty on stage.** The **pre-warm cache** is non-negotiable. Before pitching, run the three demo signals through the real pipeline and cache every response to disk (`cache/{signal_id}.json`). The demo reads cache: instant and reliable even if wifi dies, still genuinely real data. Keep one live call ready to prove realness if a judge pushes.

## Hour-by-hour (9:30 to 17:30)

| Time | Milestone | Owner |
|---|---|---|
| 9:00 to 9:30 | Grab FullEnrich + Sillage keys at kickoff. Confirm FullEnrich base URL + auth. | all |
| 9:30 to 11:00 | FullEnrich client working: sync `search_company` + `search_people` return real data. `GET /account/credits` logged. Lock the mock signal schema. | integration |
| 11:00 to 13:00 | Claude verify loop: tools wired, structured JSON verdict, evidence chain, explicit verdict rules. | agent logic |
| 13:00 to 13:30 | Lunch / integrate: loop calls real FullEnrich end to end on one signal. | all |
| 13:30 to 15:00 | The three demo signals curated and passing. UI: three verdict cards + evidence. | ui + logic |
| 15:00 to 16:00 | Pre-warm cache built and wired. Demo runs entirely from cache. | integration |
| 16:00 to 16:30 | Swap in live Sillage feed if we have a key. Otherwise polish the mock path. | integration |
| 16:30 to 17:30 | Freeze build. Cache everything. Rehearse the pitch three times. | all |

## Stack (proposed, change freely on day)

- Node + TypeScript, single small server.
- `@anthropic-ai/sdk` for the Claude loop, Sonnet.
- FullEnrich via REST (base `https://app.fullenrich.com/api/v2`, `Authorization: Bearer`).
- One static HTML page for the three cards. No framework needed for three cards.
- A `cache/` dir of JSON for the pre-warm.

## Pitch structure (rehearse this, not the code)

1. **Problem** (15s): intent data is half noise, reps chase ghosts, domains get burned.
2. **Solution** (15s): Litmus is the precision layer. Signal in, truth out, with proof.
3. **Demo** (45s): three cards. The gotcha: the hot signal that is actually dead.
4. **Why us / why now** (15s): everyone sells more signals; the market's constraint moved to precision; both sponsors get better with us in the loop.

## First tasks when the repo goes live Thursday

- [ ] `npm init`, add `@anthropic-ai/sdk`, dotenv.
- [ ] `.env` with `ANTHROPIC_API_KEY`, `FULLENRICH_API_KEY`, `SILLAGE_API_KEY` (if issued).
- [ ] Implement `src/fullenrich.ts` sync search calls, test against one real company.
- [ ] Implement `src/verify.ts` Claude loop with the three tools + structured output.
- [ ] Curate the three demo signals in `mock/signals.json`.
- [ ] Build the pre-warm cache script.
- [ ] Single-page UI.
- [ ] Rehearse.
