# 🧪 Litmus — the scoring layer for leads

**Turns your intent firehose into 3 leads to work this morning — with proof.**

Built at the **Agentic GTM Hackathon** (Anthropic × FullEnrich × Sillage, Station F, Jul 2026) · Track 1: Acquisition.
🔗 **Live demo:** https://litmus-roan.vercel.app · 📺 Demo video: _(link)_ · 💻 One engine, four doors: dashboard · Slack · CLI · MCP.

---

## The problem

Sales reps drown in signals. Sillage surfaces intent, FullEnrich cleans the data — but a rep still opens a firehose of "hot" accounts every morning with **no principled way to know which to work, why, or whether the signal is even true.** Intent data runs **31–47% false positives**, CRM data rots **15–20% per quarter**, and 35–45% of buyers are remote (so IP-based attribution is broken). Everyone sells *more signals*. Nobody checks them.

## What Litmus does

Litmus is the brain in the middle of the GTM stack. It scores the firehose against **what you actually sell**, ranks it, explains itself, and acts.

```
CRM / Sillage / FullEnrich ─▶ normalize ─▶ [ LITMUS.md scoring + why-now ] ─▶ signal-aware dedup ─▶
   8,432 scouted                             (Anthropic agent loop)              20 hot → 3 PRIME
        │                                                                              │
        └──────────────────────── verify against FullEnrich ground truth ─────────────┘
                                                                                       ▼
                       drafts (email · telegram · linkedin · xAI voice call) ─▶ approve ─▶ send (Unipile) ─▶ 👍/👎 tunes next run
```

**8,432 scouted → 312 verified reachable → 20 hot → 3 PRIME.** Each PRIME lead ships with:
- a **litmus reading** — 🧪 ACID (reactive, act now) vs BASE (inert, skip), the score as pH;
- a pinpointed **why-now** — the trigger, what materially changed, why they'll buy;
- a cited **evidence chain** you can open on the card;
- ready **drafts** for email, Telegram, LinkedIn, and a phone/voice-call script.

## How the scoring works (the defensible part)

Litmus uses a **fit × way-in** lead-scoring framework built for a real-time signal feed — with two research-backed upgrades that cut false positives the most.

| Factor | What it asks | Source |
|---|---|---|
| `icp_fit` | **fit** — do they match what you sell? (rules-encoded ICP) | client context + firmographics |
| `warm` | **way-in + signal strength** — do we have a path, and how strong is the signal behind it? | relationship graph + Sillage signal type + corroboration |
| `real` | **the verification gate** — is this a live, true opportunity? | **FullEnrich ground truth** |

`warm` is a composite the model blends and cites: `0.55·relationship_edge + 0.30·signal_strength + 0.15·corroboration` — the way in, how strong a signal Sillage surfaced (competitor move > champion move > job change > keyword > thin engagement), and how many independent signals stack. We deliberately dropped a standalone `urgent`/recency factor: Sillage surfaces signals within a day, so freshness is a constant that can't rank leads — what discriminates is signal strength and whether we have a way in.

**Composite (deterministic, auditable):** `score = 100 · real · icp_fit · (0.4 + 0.6·warm)`

- **Upgrade 1 — the gate.** `real` and `icp_fit` *multiply*: a dead or out-of-ICP lead scores ~0 no matter how hot the signal. This is the research prescription — *require multiple independent positive signals before flagging an account* — enforced in math, not vibes.
- **Upgrade 2 — verification on ground truth.** The `real` factor verifies the person against FullEnrich *before* anything scores high, instead of scoring rotten CRM data. **The independence rule:** Sillage can never verify a Sillage signal — FullEnrich is the outside witness.
- **Not a black box.** The model scores three factors, each citing its exact field; the composite is computed in code by a fixed formula; every card carries the why-now and evidence chain.

> **FullEnrich makes your data true. Litmus makes it actionable.**

## The money moment (live, on real data)

Sillage fires a promotion signal — *"VP Sales → SVP Sales at Northwind."* Looks hot. Litmus verifies it against FullEnrich — **the SVP promotion isn't confirmed,** so `real` = 0 and the gate zeroes the composite. Score: **0 — killed.** We don't let the rep chase it, and we show the proof. *Verify, don't trust.*

## Architecture — one headless engine, four doors

The scoring engine is pure functions (`lib/`, `src/`). Every surface is a thin door over the same engine:
- **Dashboard** (Next.js on Vercel) — the morning brief, the filter animation, approve & send, the eval loop.
- **Slack** — the brief delivered to a per-rep channel via the Web API.
- **CLI** — `npm run cli -- brief` prints the ranked brief in the terminal (colors, litmus verdicts).
- **MCP server** — `litmus_todays_brief` / `litmus_score_contact`; any agent (Claude, xAI Voice) can call Litmus as a tool.

## Sponsors & tools — all load-bearing

- **Anthropic (Claude)** — the agent loop: triages the batch, spends enrichment credits only on plausible winners, verifies, emits ranked with cited evidence. Scoring model: `claude-sonnet-5`.
- **FullEnrich** — three surfaces: the people database (search), enrichment (verified email/phone), and the **independent verification gate**. Reverse-email as a bonus flow.
- **Sillage** — intent signals via MCP (Bearer key, no OAuth). We seed the workspace and pull real detections.
- **Unipile** — multi-channel send (email + LinkedIn + Telegram), tested live, behind a hard safety gate.
- **xAI Grok Voice** — the voice channel: a Grok voice agent calls the Litmus MCP to brief the rep or place a call.

## Feedback loop (it learns)

The review step rates the **lead** and the **message** (👍/👎 + structured reason chips — research-backed for higher-quality learning signal). Ratings write to `feedback.jsonl` and are injected into the scoring prompt as few-shot. Declined leads go quiet via a **signal-aware suppression ledger** — a lead only resurfaces if its job/company/signal actually changed.

## Run it locally

```bash
npm install
cp .env.example .env          # add ANTHROPIC_API_KEY, FULLENRICH_API_KEY, SILLAGE_API_KEY (+ optional Unipile/Slack/HubSpot)
npm run dev                   # http://localhost:3000
npm run cli -- brief --source sillage-agent --top 5   # the terminal door
npm run mcp                   # the MCP door (stdio)
```

Litmus works with **any** of its sources — connect all for the sharpest scoring, or run CRM/CSV-only. Anthropic runs the scoring server-side (users never bring an AI key).

## Repo map

`LITMUS.md` — the scoring prompt (the IP) · `lib/agent-loop.ts` — the agent · `lib/pipeline.ts` — the flows · `src/` — clients (Sillage, FullEnrich, Unipile, HubSpot) + engine · `app/` — the dashboard · `bin/` — CLI + MCP · `ARCHITECTURE.md`, `CONTEXT.md`, `WORKFLOW.md` — docs.

## Team

Oscar · Pierre · Desiree — Station F, July 2026.
