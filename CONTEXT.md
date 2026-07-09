# CONTEXT — Litmus full status (living doc)

Team state. Pull, read this, jump in. Submission day — Station F Agentic GTM, Jul 2026.

## What Litmus is
The scoring layer for intent. From 8,000 CRM contacts, cleaned by FullEnrich and the latest signals from Sillage, powered by Anthropic — Litmus gives you the sharpest outreach and the 3 perfect prospects of the day. Track 1 — Acquisition.

## Live
- **Deployed:** https://litmus-roan.vercel.app · Build green. `npm run dev` locally on :3000.
- **Demo runs from localhost** (send/Telegram/voice/HubSpot keys are local-only); the public URL is view-only for those.

## The flow (matches the pitch narrative)
1. **Connect** — CRM (HubSpot) / Sillage / FullEnrich. Auto-detected server-side; nothing to paste.
2. **Context** — what you sell. Auto-drafted from your company website (Anthropic web search) + Sillage persona pull; you tweak. Stored in localStorage → passed into `LITMUS.md {{CLIENT_CONTEXT}}` on every live run.
3. **Score** — 8,432 scouted → 312 reachable → 20 hot → **3 PRIME**. fit × intent × timing, gated on verified ground truth. Each lead: **litmus reading** (ACID/NEUTRAL/BASE, pH), **why-now** (trigger/changed/why-buying), cited **proof** chain, multi-channel **drafts**.
4. **Deliver** — the brief to Slack · Telegram · HubSpot · dashboard · CLI (all tested).
5. **Evaluate** — rate the lead + the message (👍/👎 + reason chips) → feeds the scoring as few-shot. Signal-aware dedup: no repeat leads unless job/company/signal changed.
6. **Act** — send email · Telegram (real, via Unipile) · LinkedIn (prod) · call via xAI Grok Voice.

## Scoring (the IP — `LITMUS.md`)
`score = 100 · real · icp_fit · (0.4 + 0.35·urgent + 0.25·warm)` — deterministic, cited, auditable. `real`+`icp_fit` gate (multiply), `urgent`+`warm` boost. Verify against FullEnrich (independence rule: Sillage can't verify Sillage). Research-grounded — see `01 Projects/Hackathons/litmus-scoring-pitch.md`.

## Sources & tools (all verified working)
- **FullEnrich** — DB search + enrich + reverse-email + the verification gate. 2550 cr.
- **Sillage** — MCP over HTTP (Bearer key). Seeded workspace; live `recentlyPromoted` detections.
- **Anthropic** — the agent loop (`lib/agent-loop.ts`, Pierre) + scoring + why-now + web-search context draft. `claude-sonnet-5`.
- **Unipile** — email + Telegram send (real, tested to owner accounts). LOCAL only.
- **HubSpot** — source (read contacts) + output (writes score to contact `message` field). 4 demo contacts seeded.
- **xAI Grok Voice** — voice briefing (`/api/voice-brief`, WebSocket). LOCAL only.
- **Supabase** — persists the brief cache + feedback (survives Vercel cold starts). File fallback if tables absent. **⚠️ tables need creating — see below.**

## Doors (one headless engine)
Dashboard · Slack · **CLI** (`npm run cli -- brief`, colored, litmus verdicts) · **MCP** (`npm run mcp` — `litmus_todays_brief`, `litmus_score_contact`).

## Caching (the 3-min loop)
Pre-warm: run once → `writeBriefCache` (Supabase or file) → dashboard `/api/prospects` serves the real brief **instantly**. Never run the live loop on stage.

## APIs
`/api/run` (live pipeline, source+destination+targetCompanies, writes cache) · `/api/prospects` (cache→mock) · `/api/deliver` (Slack/Telegram/HubSpot) · `/api/send` (Unipile, guarded) · `/api/voice-brief` (xAI) · `/api/feedback` (+ Supabase) · `/api/draft-context` (AI onboarding) · `/api/persona` (Sillage) · `/api/connections` (what's connected).

## ⚠️ Supabase — run this SQL in the dashboard to activate
```sql
create table if not exists brief_cache (id bigint generated always as identity primary key, at timestamptz not null default now(), source text, prospects jsonb not null default '[]'::jsonb);
create table if not exists feedback (id bigint generated always as identity primary key, at timestamptz not null default now(), signal_id text, target text, verdict text, reason text);
alter table brief_cache enable row level security;
alter table feedback enable row level security;
create policy "anon brief_cache" on brief_cache for all to anon using (true) with check (true);
create policy "anon feedback" on feedback for all to anon using (true) with check (true);
```
Until then, the file fallback handles it — nothing breaks.

## ⚠️ Safety
Unipile + HubSpot + xAI keys LOCAL only. Sends guarded: `LITMUS_SEND_ARMED=1`, external email refused, Telegram → owner's own chat, HubSpot write needs `HUBSPOT_WRITE_ARMED=1`. Buttons on the public URL honestly gate ("view-only here").

## Run locally
`npm i` → `cp .env.example .env` (fill keys) → `npm run dev`. `npm run cli -- brief --source sillage-agent`. `npm run mcp`.

## Demo guidance
Open on **Demo data** (instant, curated 92→8 money moment) → **Run today's brief** (live, dynamic proof) → deliver to Slack/Telegram/HubSpot → send email/Telegram real → rate it (it learns). Docs: `ARCHITECTURE.md`, `LITMUS.md`, `WORKFLOW.md`; pitch in Obsidian `01 Projects/Hackathons/litmus-*`.
