# Litmus — Team Workflow (hackathon rules)

Three people, one repo, eight hours, live demo at 18:00. These rules exist so we never lose 30 minutes to a merge conflict or a broken main. Read once at kickoff, then they should be muscle memory.

## The one law

**`main` is always demoable.** At any minute of the day, `git clone && npm i && npm run dev` must work. If the jury called us on stage RIGHT NOW, we demo whatever main holds. Nobody pushes anything to main that breaks that.

## Branching: trunk-based, short-lived

- Work directly on `main` for small, isolated changes in YOUR files (see ownership map). Pull before you push: `git pull --rebase && git push`.
- Branch only for anything risky or >30 min of uncommitted work: `oscar/verdict-rules`, `pierre/fullenrich-client`, `desiree/ui-cards`. Merge back to main YOURSELF within the hour — no long-lived branches, no PR reviews today. PRs are for companies; we have 8 hours.
- Never rewrite pushed history. No force-push to main, ever.

## Ownership map (conflicts are structurally impossible if we respect this)

| Area | Files | Owner |
|---|---|---|
| Engine: FullEnrich client, agent loop, relationship DB, cache | `src/fullenrich.ts`, `src/verify.ts`, `src/relationship.ts`, `src/prewarm.ts` | **Pierre** |
| Verdict rules, demo data, pitch | `mock/*.json`, `PITCH.md`, verdict-rule constants in `src/verify.ts` (coordinate with Pierre) | **Oscar** |
| UI, demo path, entry point | `src/index.ts`, `public/` (UI page), demo script | **Desiree** |
| Shared contract | `src/types.ts` | **Frozen after 10:00.** Changing it requires all three saying yes out loud. It is the interface between all our work. |

Touching someone else's file: say it out loud first ("I'm in fullenrich.ts for 5 min"). Two people in one file at once is the only way we get conflicts, so we just don't.

## Commit discipline

- Commit every 20-30 min minimum. Small commits, plain messages: what it does, present tense. `wire enrich poll wrapper`, `add NOISE gotcha card`. No perfect messages, no squashing.
- Push immediately after every commit. An unpushed commit helps nobody, and a dead laptop at 16:00 must cost us nothing.
- Broke main? Say it out loud, fix forward or `git revert` within 5 minutes. No blame, just speed.

## Integration checkpoints (from BUILD_PLAN, these are hard syncs)

- **10:00** — types.ts freeze. The `Signal` / `LitmusResult` contract is locked.
- **13:00** — first end-to-end: real signal → loop → verdict JSON on main.
- **15:00** — cache-first demo runs from main. Round-1 cut frozen after this.
- **16:30** — FULL FREEZE. After 16:30 nothing merges to main except a fix for a bug we can name. Polish dies here; rehearsal begins.

## The freeze rule (Desiree enforces, and outranks everyone after 16:30)

After the 16:30 freeze, the answer to "can I just quickly add..." is no. Desiree has explicit authority to reject any push, including Oscar's. The demo we rehearse is the demo we give.

## Secrets

- `.env` never gets committed (already in .gitignore — verify at kickoff). Keys are shared out loud / via Signal at 9:00, each person keeps their own `.env` from `.env.example`.
- The pre-warm `cache/` DOES get committed once built — it is our wifi-proof demo data and everyone needs it locally.

## If something goes wrong

- Merge conflict anyway → the file's OWNER resolves it, other party stands by. 5 min max.
- Main broken + can't fix fast → `git revert` the breaking commit, keep moving, fix on a branch.
- Laptop dies → everything is pushed (see commit discipline), clone on another machine, keys from `.env.example` + shared keys. Cost: 5 minutes.
