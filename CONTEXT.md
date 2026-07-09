# CONTEXT — where Litmus stands (living doc)

Team onboarding + running state. Pull, read this, jump in. Updated as we go.

## What Litmus is (one line)
The scoring layer for intent: score the firehose against what you sell, rank the ten that matter, draft the outreach, send it. Track 1 — Acquisition. The magic is `LITMUS.md`.

## Live
- **Deployed:** https://litmus-roan.vercel.app (Next.js on Vercel, auto via `npx vercel --prod`).
- **Build:** green. `npm run dev` locally on :3000.

## The pipeline (all real)
```
sources ─▶ normalize ─▶ [ LITMUS.md scoring (Sonnet) ] ─▶ top N ranked + drafts ─▶ output ─▶ Unipile send
```
Score = `100 × real × icp_fit × (0.6 + 0.25·urgent + 0.15·warm)`. Sonnet for cost.

## Sources (all verified working)
- **FullEnrich** — live, 2550 credits. Two roles: prospect DB (`/people/search`) + enrich (email/phone) + reverse-email. Client: `src/fullenrich.ts`.
- **Sillage** — MCP over HTTP w/ Bearer key (no OAuth). Client: `src/sillage.ts`. Workspace SEEDED (persona, 5 accounts, keyword agent, run #404 completed — 0 keyword detections so far). Feedable entirely via API.
- **Anthropic** — server-side (ours, users never bring a key). `claude-sonnet-5`.
- **Unipile** — connected (Gmail + Telegram). Send verified via self-test. ⚠️ LOCAL ONLY — see safety below.

## Flows (source-optional — Litmus works without any single source)
- **Flow A** (default): FullEnrich ICP search → score. Works on Enrich alone. `/api/run`.
- **Flow B**: Sillage detections → `get_lead` → score. `source:"sillage"`.
- **Flow C**: CRM/CSV contacts → score. No FullEnrich/Sillage. `contacts:[...]`.
- **Flow D**: email list → FullEnrich reverse-lookup → score. `emails:[...]`.

## App
- `/onboarding` — 3 steps: context → connect sources (key/MCP) → output config (destination, cadence, count).
- `/dashboard` — CRM cloud → filter animation → ranked brief w/ scores, factors, drafts, approve/decline.
- `/api/run` (live pipeline, config-driven), `/api/prospects` (mock fallback), `/api/feedback`, `/api/send` (Unipile, guarded).

## ⚠️ Unipile / send SAFETY (read before touching)
- Key is **LOCAL `.env` ONLY** — never in git, never on Vercel. Do not add it to Vercel.
- `/api/send` is **dry-run by default** (`LITMUS_SEND_ARMED` must be `1` to transmit), defaults to owner inbox, refuses external addresses without `confirmExternal:true`. NO Telegram-send code exists.
- Dashboard "Approve" is a SIMULATED send — it does not call Unipile.

## Next (help wanted)
- [ ] Onboarding 4-layer context (WHO pulled from Sillage persona / WHAT / HOW / WHY-GOOD) — the IP upgrade. Owner: Oscar + me.
- [ ] Tune `LITMUS.md` weights on real output. Owner: Oscar. Highest leverage.
- [ ] Real Sillage detections — try interaction agents (competitor/customer) or broader keywords; keyword run found 0.
- [ ] HubSpot output sink (account now available) — stretch.
- [ ] Slack sink live (Block Kit) when a webhook is added.

## Roadmap (post-hackathon)
- **Knowledge base / RAG over seller collateral** (Jonathan's pitch, Jul 9): retrieve the seller's case studies, battlecards, winning emails per prospect to ground scoring + drafts. Real depth lever + moat. NOT for the hackathon (scope). Cheap first step: a "paste your docs" context field before committing to a vector DB — big context windows may beat retrieval for a single seller's corpus.

## Rules
Trunk-based, commit every ~20-30 min, push immediately, `main` always demoable. See `WORKFLOW.md`. Keys: `.env` from `.env.example` (Anthropic/FullEnrich/Sillage on Vercel; Unipile local only).
