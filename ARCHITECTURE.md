# Litmus — Architecture Review (v2, ambitious)

For the team (Oscar / Pierre / Desiree) to review before we cut code. Companion to `BUILD_PLAN.md`.
This is the "be ambitious" version, scoped to a hard 17:30 freeze and a **two-round pitch** (everyone pitches once; finalists pitch again). The two rounds map onto two demo depths from **one** build.

---

## The thesis in one line

Every GTM tool adds more (signals, sends, records). None checks if any of it is still true. **Litmus is the verification + routing layer for GTM.** Give it a signal, and it answers two questions a rep actually has: *is this real?* and *do we have a way in?* — then tells them what to do, with proof.

## What changed from v1

v1 verified one axis: **is the signal true?** Verdict was `REAL / NOISE / NEEDS_SECOND_SIGNAL`.

v2 adds a second axis: **is it warm?** — powered by a seeded relationship DB. This is the upgrade that (a) makes it a product not a feature, (b) lets us tell the warm-path (#5) and champion (#9) stories **without cloning Sillage**, and (c) gives us a natural round-1 / round-2 split.

### Why the relationship DB, and why it's safe to add

- It turns a binary noise-filter into a **prioritization + routing engine**. The rep doesn't just learn "real/noise", they learn "warm-intro via Marie" vs "verified cold" vs "drop".
- It dissolves the Sillage-clone trap. **Sillage detects the champion move. We verify it (FullEnrich) and route it (relationship DB).** We sit downstream, making Sillage's signal provably actionable and warm. Complementary, not competitive — the correct posture in front of a Sillage judge.
- It's cheap because we **seed**, never crawl. Two free sources: Sillage's own champion-move history (already relationship edges), and a small mock CSV of "who the team knows" for the live warm-path beat.

---

## The core primitive

```
verify(claim) -> { truth, warmth, action, confidence, evidence[] }
```

One function, three input streams, one structured output. Everything else is a surface that calls it.

### The two axes -> four plays

|            | WARM (path exists)                        | COLD (no path)                     |
|------------|-------------------------------------------|------------------------------------|
| **REAL**   | warm intro via X  (champion story #5+#9)  | verified cold outreach (Litmus #1) |
| **NOISE**  | drop, here's proof (the gotcha)           | drop, here's proof                 |
| **UNPROVEN** | watch / needs second signal             | watch / needs second signal        |

The NOISE gotcha is the round-1 hero. The REAL+WARM champion beat is the round-2 depth.

---

## System architecture

```
                        ┌─────────────────────────────┐
   Sillage signal ─────▶│                             │
   (intent + champion   │      Claude agent loop      │───▶ Verdict (structured JSON)
    moves; mock at start│      (Fable — fast + sharp) │      { truth, warmth, action,
    live swap-in)       │                             │        confidence, evidence[] }
                        │   tools:                    │              │
                        │   • search_company   ───────┼──▶ FullEnrich  (truth axis)
                        │   • search_people    ───────┤    verified email/phone/role
                        │   • enrich_contact   ───────┘
                        │   • lookup_relationship ────┼──▶ Relationship DB (warmth axis)
                        │   • find_second_signal      │    seeded: Sillage champ history
                        └─────────────────────────────┘    + team network CSV
                                     │
                                     ▼
                          UI: verdict cards (2×2 + evidence chain)
                                     │
                          Pre-warm cache (disk) — demo reads cache, one live call held ready
```

### Components

1. **Signal ingest.** Mock `mock/signals.json` from minute zero. Live Sillage is a swap-in, never a dependency. Champion-move signals are just another `type` in the same schema.
2. **FullEnrich client (truth substrate).** Sync `search_company` + `search_people`; `enrich_contact` wraps the async poll. Cap loop at ~5 tool calls. `GET /account/credits` logged.
3. **Relationship DB (warmth substrate).** Seeded SQLite (or flat JSON if time is tight). Table: `edges(person, company, relationship_type, strength, as_of)`. Read-only. **No graph-building** — seeded only. One tool: `lookup_relationship(person) -> path | none`.
4. **Agent loop (brain).** Fable. FullEnrich + relationship calls exposed as tools. **Forced structured JSON output** — UI renders from JSON, never parses prose live.
5. **Verdict rules (explicit, not vibes).** Each axis has hard rules and cites the exact field that drove it:
   - truth: company unverifiable → NOISE; person not in role now → NOISE; confirmed no corroboration → UNPROVEN; confirmed + corroboration → REAL.
   - warmth: relationship edge with `as_of` still valid → WARM (name the path + strength); else COLD.
   - action derived from the 2×2.
6. **UI.** Verdict cards showing the 2×2 position + evidence chain. Single page, no framework needed.
7. **Pre-warm cache.** Non-negotiable. Run all demo signals through the real pipeline pre-pitch, cache every response (FullEnrich + relationship) to disk. Demo reads cache — instant, wifi-proof, still real data. One live call held ready if a judge pushes.

### Schema delta (from `src/types.ts`)

```ts
type Truth  = "REAL" | "NOISE" | "UNPROVEN";
type Warmth = "WARM" | "COLD";
type Action = "WARM_INTRO" | "VERIFY_COLD" | "DROP" | "WATCH";

interface LitmusResult {
  signal_id: string;
  truth: Truth;
  warmth: Warmth;
  warm_path?: { via: string; relationship: string; strength: number };
  action: Action;
  confidence: number;
  evidence: EvidenceItem[];   // now spans both axes
}
```

---

## Sponsor fit (all three load-bearing)

- **Sillage** = signal source, *including champion moves*. We consume, verify, route. We make their signals provably actionable. Never "your signals are unreliable" — always "we make your signals provably actionable."
- **FullEnrich** = the truth substrate. Every REAL/NOISE call cites a FullEnrich field.
- **Claude (Fable)** = the reasoning engine running the two-axis verdict loop.

---

## Risk register

| # | Risk | Mitigation | Owner |
|---|------|------------|-------|
| 1 | Relationship DB scope creep eats the day | **Seeded only, read-only, one lookup tool. No crawling.** ~1h box. If it slips, truth-only demo still stands (graceful degradation). | Pierre |
| 2 | Sillage API no-show / flaky | Mock from minute zero; live is swap-in. Demo off mock is invisible. | Pierre |
| 3 | Live enrich latency on stage | Pre-warm cache covers FullEnrich + relationship lookups. | Pierre |
| 4 | Two-axis verdict reads as "vibes" | Explicit per-axis rules; cite exact fields; Fable for speed+quality. | Oscar |
| 5 | Two-round pitch tempts two demos | **One build, two depths.** Round 1 = truth axis + NOISE gotcha (60s, bulletproof). Round 2 = warmth axis + champion beat + "one engine, any surface". Never build two demos. | Desiree |
| 6 | Over-scope generally | One primitive, one demo path with a shallow and a deep cut. Not on the path → not built. | Desiree |

---

## Open questions for the team

1. Relationship DB: SQLite or flat JSON? (JSON is faster to seed, SQLite reads cleaner in the pitch. Pierre's call.)
2. Which real, recognizable person do we build the NOISE gotcha and the champion beat around? Must land as true, not toy.
3. Do we seed the team's own network for the live warm-path demo, or use a clean mock persona set?
4. Fable vs Sonnet for the loop — Fable for latency, confirm the verdict quality holds on the two-axis reasoning.
