# CONTEXT — where Litmus stands (living doc)

Team onboarding + running state. Pull, read this, jump in. Updated as we go.

## What Litmus is (one line)

The scoring layer for intent: score the firehose against what you sell, rank the ten that matter, draft the outreach, send it. Track 1 — Acquisition. `real` + `icp_fit` gate the score, `urgent` + `warm` boost it. The magic is `LITMUS.md`.

## The pipeline

```
CRM ─▶ SILLAGE ─▶ FULLENRICH ─▶ LITMUS SCORE ─▶ ACTION ─▶ OUTPUT
       intent     phone+email    Anthropic       Unipile    Slack / HubSpot / dashboard
```
Two source-flows into one scorer:
- **Flow A (works NOW):** FullEnrich `/people/search` by ICP → score → rank → enrich winners. No Sillage needed.
- **Flow B (kickoff):** Sillage MCP signal → FullEnrich verifies → score.

## Run it locally

```
npm install
cp .env.example .env      # fill keys (see below)
npm run dev               # http://localhost:3000
```
- `/` landing · `/onboarding` client context (set once) · `/dashboard` the morning brief.
- Dashboard loads **mock** (always works). Hit **"run live ↻"** to run the real FullEnrich→score workflow (needs keys).

## Where the API keys go

**Local:** in `.env` at the repo root (gitignored — never commit keys). From `.env.example`:
- `FULLENRICH_API_KEY` — Bearer key from FullEnrich dashboard. **Needed for live run.**
- `ANTHROPIC_API_KEY` — **needed for live run** (the scoring call).
- `UNIPILE_DSN` + `UNIPILE_API_KEY` — from Unipile dashboard (7-day trial). For send.
- `SLACK_WEBHOOK_URL` — incoming webhook. For the Slack sink.
- `HUBSPOT_TOKEN` — private-app token (dev test account). Stretch.
- Sillage: **no key** — connect via `claude mcp add --transport http sillage https://api.getsillage.com/api/mcp/v2` (OAuth).

**Vercel:** Project Settings → Environment Variables → add the same keys → redeploy. (`.env` is not deployed.)

## Deploy

`npx vercel --prod`, or connect the repo at vercel.com/new (Next.js auto-detected). Every push to `main` auto-deploys.

## Status (what's built)

- ✅ Next.js app: landing, onboarding, dashboard (Editorial Brief design). Build passing.
- ✅ Engine: `src/fullenrich.ts` (verified), `src/score.ts` (Anthropic scoring, real), `src/normalize.ts`, `src/relationship.ts`, `src/unipile.ts`, `src/sinks.ts`, `src/feedback.ts`.
- ✅ `LITMUS.md` — the scoring prompt (the IP).
- ✅ Live workflow `/api/run` (Flow A) — needs keys.
- ✅ Mock fallback `/api/prospects` — always demoable.

## Next (help wanted)

- [ ] **Sillage MCP live pull** → cache real signals (Flow B). Owner: Pierre. Needs OAuth via Claude Code.
- [ ] **Unipile send** wired to the Approve button (email + LinkedIn to an existing connection). Owner: Pierre.
- [ ] **Tune `LITMUS.md`** weights + rubric on real output. Owner: Oscar. **Highest leverage — it's what's judged.**
- [ ] **Slack sink** live (Block Kit). Owner: Desiree.
- [ ] **Design tuning** on the Vercel preview. Owner: Desiree.
- [ ] HubSpot sink (stretch) · Gradium voice (stretch).

## Ownership / rules

See `WORKFLOW.md`. Trunk-based, commit every 20-30 min, push immediately, `main` always demoable, types.ts frozen 10:00, full freeze 16:30.
