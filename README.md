# Litmus

**Litmus is the scoring layer for intent.** It reviews Sillage's signal firehose, scores and ranks what to act on with cited reasoning, enriches the contact, drafts the outreach, and fires it multi-channel — into whatever destination you already use.

Built for the Station F Agentic GTM Hackathon (Thu Jul 9). Track 1 — Acquisition. Sponsors: Claude Startups (Anthropic), FullEnrich, Sillage.

## The pitch

**Problem.** Sillage surfaces a *lot* of intent. That's the point — and the problem. A rep opens a firehose of signals every morning and has no principled way to decide which five accounts to work, why, or how to reach them. Everyone sells more signals; nobody tells you which ones matter.

**Solution.** Litmus is the brain in the middle of the GTM stack. It scores every signal on real, warm, urgent, and ICP-fit, ranks them into a worklist with a cited reason for each, enriches the top contacts to reachable email + phone, drafts personal outreach, and sends it across email and LinkedIn. Destination-agnostic: the output lands in HubSpot, Salesforce, Slack, or a dashboard.

**Why it's not glue.** Everything except the scoring is a commodity connection. The score + the reasoning (Anthropic) is the proprietary part. That's what the demo shows its work on.

## The pipeline

```
CRM (HubSpot/Salesforce) ─▶ SILLAGE ─▶ FULLENRICH ─▶ LITMUS SCORE ─▶ ACTION ─▶ OUTPUT
   provides accounts       intent      phone+email   Anthropic:       Unipile:   agnostic sink:
   to watch                firehose    (reachable)   score+rank+why   LinkedIn   HubSpot / SF /
                                                      (the IP)         + email    Slack / dashboard
```

1. **Sillage (MCP)** streams intent signals for the accounts you watch.
2. **FullEnrich** turns a matched person into a reachable contact (verified email + mobile).
3. **Litmus scores** every signal — real · warm · urgent · ICP-fit — into a 0-100 rank with a cited reason (Anthropic).
4. **Unipile** sends the drafted email + LinkedIn message on behalf of the rep.
5. **Output** is rendered into any sink: Slack (demo), HubSpot / Salesforce (adapter), or the dashboard.

## Sponsor / tool fit (all load-bearing)

- **Sillage** — the intent source. We consume the firehose and make it a ranked worklist.
- **FullEnrich** — reachability: verified email + phone so a scored account is actionable.
- **Claude (Anthropic)** — the scoring + reasoning engine. The differentiator, not orchestration decoration.
- **Unipile** — the action layer: one API, email + LinkedIn, on behalf of the rep.

## Repo

- `ARCHITECTURE.md` — the scoring pipeline, schema, and design decisions.
- `BUILD_PLAN.md` — hour-by-hour, guaranteed vs stretch, roles.
- `WORKFLOW.md` — how the three of us push to this repo without stepping on each other.
- `mock/` — Sillage-shaped signals + seeded relationships to build against before live data.
- `src/` — stubs: Sillage/FullEnrich/Unipile clients, the score engine, the agnostic output sinks.
