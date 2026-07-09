# CONTEXT — where Litmus stands (living doc)

Team state. Pull, read this, jump in. ~2h to submission (live demo).

## What Litmus is
The scoring layer for intent: score the firehose against what you sell, rank the few that matter *with a pinpointed why-now*, draft the outreach, deliver it, send it. Track 1 — Acquisition. The IP is `LITMUS.md`.

## Live
- **Deployed:** https://litmus-roan.vercel.app (Slack env is on Vercel; Unipile + HubSpot tokens are LOCAL only).
- **Slack channel:** #litmus-test (bot `litmus_bot`). `POST /api/slack-test` posts a sample brief.
- Build green. `npm run dev` locally on :3000.

## The pipeline (all real)
```
sources → normalize → [LITMUS.md score + why-now] → signal-aware dedup → top N → drafts → deliver → approve → send → feedback tunes it
```
Score = `100 × real × icp_fit × (0.4 + 0.35·urgent + 0.25·warm)`. **Urgency (why-now) dominates** — a lead with no trigger floors ~40, not "work today". Sonnet for cost.

## Sources (verified working)
- **FullEnrich** — DB (`/people/search`), enrich (email/phone), reverse-email. 2550 credits. The reliable backbone.
- **Sillage** — MCP over HTTP w/ Bearer key (no OAuth). Seeded via API (persona/accounts/agent/run). Keyword run = 0 detections (sparse); use interaction agents for real ones.
- **HubSpot** — read (source, Flow E) live; write (sink) guarded by `HUBSPOT_WRITE_ARMED`.
- **Anthropic** — server-side (ours). `claude-sonnet-5`.
- **Unipile** — Gmail + Telegram connected. Send tested to owner inbox. Guarded.

## 5 source flows (Litmus works without any single source)
FullEnrich ICP search (default, targets real accounts) · Sillage detections · HubSpot contacts · CRM/CSV · reverse-email.

## App
- `/onboarding` — 4-layer context (WHO+Sillage-pull / WHAT / HOW / **WHY-GOOD**) → connect sources → output config (destination/cadence/count).
- `/dashboard` — CRM cloud → filter animation → ranked brief w/ score, **why-now (trigger/changed/why-buying)**, factors, drafts, approve/decline. `?focus=<id>` = single-prospect review (Slack deep-link lands here).
- APIs: `/api/run` (live, source+destination+targetCompanies), `/api/prospects` (mock), `/api/feedback`, `/api/send` (guarded), `/api/slack-test`, `/api/persona`.

## Learning + dedup
- **Feedback loop** (wired): 👍/👎 → `feedback.jsonl` → injected as few-shot into scoring. Reject → it re-ranks.
- **Dedup ledger**: no repeat leads within cooldown (surfaced 7d / declined 21d / sent 60d) UNLESS job/company/signal changed or score +15.
- Both ephemeral on Vercel (reset on cold start) → demo the learning locally or narrate.

## ⚠️ Send SAFETY
- Unipile + HubSpot write tokens LOCAL only. `/api/send` dry-run unless `LITMUS_SEND_ARMED=1`, external refused without `confirmExternal`. HubSpot write needs `HUBSPOT_WRITE_ARMED=1`. Dashboard "Approve" is simulated. No Telegram-send code.

## Demo guidance (read before the pitch)
- **Lead with the curated brief** (`92` champion → `8` killed false-positive → `5` out-of-ICP) — perfect distribution, reliable, the whole story in one screen. The 92-vs-8 contrast is the money moment.
- **"Run live" = the "and it's real" proof** — real in-ICP people from FullEnrich, honestly scored 40-60 (no trigger → not inflated).
- **A 90+ hero needs a real trigger** (job change / funding / Sillage champion). Optional: add recent-job-changers filter to make live runs produce heroes.
- Don't depend on live Sillage firing on cue. Tell the fusion + seeded-workspace story.

## Next (2h to submission)
- [ ] Fill real client context + WHY-GOOD (Oscar)
- [ ] Curate + rehearse the 92-vs-8 story (Oscar)
- [ ] (optional) live 90+ hero via recent-job-changers filter (~10m)
- [ ] Slack: destination=Slack in a live run posts the brief (works now)

## Roadmap (post-hackathon)
Knowledge base / RAG over seller collateral · Voice channel (Grok x.ai/voice or Gradium) · real Sillage interaction agents · persist ledger/feedback (KV/Supabase) · HubSpot App Card.

## Rules
Trunk-based, commit often, push immediately, `main` always demoable. See `WORKFLOW.md`. Keys: `.env` from `.env.example`.
