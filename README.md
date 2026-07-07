# Litmus

**Litmus takes a buying signal and tells you whether it is real, with proof.**

Built for the Station F Agentic GTM Hackathon (Thu Jul 9). Sponsors: Claude Startups (Anthropic), FullEnrich, Sillage.

## The 60-second pitch

**Problem.** Intent data runs 31 to 47 percent false positives. AI sales agents churn at 50 to 80 percent a year. Every tool in the market sells you *more* signals and *more* sends. Reps burn days chasing accounts that were never in-market.

**Solution.** Litmus is the precision layer over your existing signals. Give it a signal. It gathers independent evidence, decides `REAL`, `NOISE`, or `NEEDS A SECOND SIGNAL`, and returns the verdict with a chain of proof. It sits on top of any signal source and in front of any outreach tool.

**Inspiration.** We keep building systems that verify whether information is still true instead of trusting it blindly. Point that habit at the GTM stack and the gap is obvious: everyone surfaces signals, nobody checks them. Litmus is the check.

## How it works

1. A signal arrives (Sillage, a job-change alert, any source).
2. Litmus runs a Claude agent loop that gathers evidence: confirms the company exists (FullEnrich company search), confirms the person is in that role now (FullEnrich people search + enrich), looks for a corroborating second signal.
3. It returns a verdict + evidence chain that cites exactly which checks drove the call.

## Sponsor fit

- **FullEnrich** is the verification substrate: is the org real, is the person really there.
- **Sillage** is the signal source: Litmus makes Sillage signals provably actionable. Complementary, not competitive.
- **Claude** is the reasoning engine that runs the verification loop.

## Repo

- `BUILD_PLAN.md` — the hour-by-hour plan for Thursday.
- `mock/signals.json` — sample signals to build against before we have a live Sillage key.
- `src/` — skeleton stubs (types, FullEnrich client, verify loop, entry point). Not built yet. Thursday's work.

See the full ideation brief in Obsidian: `01 Projects/Hackathons/litmus-ideation.md`.
