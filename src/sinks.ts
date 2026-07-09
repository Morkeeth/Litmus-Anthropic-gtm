// Output layer — agnostic sinks. The engine emits ScoredSignal; a thin adapter renders
// it per destination. Sinks are independent: adding one never touches the engine.
// "We just create an output" — Slack for the demo, CRM adapters as the story.

import type { ScoredSignal } from "./types";

export interface Sink {
  name: string;
  push(items: ScoredSignal[]): Promise<void>;
}

// ---------- Slack (delivery sink) ----------
// Two transports: bot token (chat.postMessage, richer) OR incoming webhook (simplest).
// Env: SLACK_BOT_TOKEN + SLACK_CHANNEL  — or —  SLACK_WEBHOOK_URL. Optional LITMUS_APP_URL.
// Cards link back to the dashboard to review+send (no Slack interactivity endpoint needed).
function slackBlocks(items: ScoredSignal[], appUrl: string) {
  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: `🎯 Litmus — ${items.length} to work today` } },
  ];
  for (const s of items) {
    const e = s.enriched;
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${s.score}/100 · ${e?.full_name ?? "?"}* — ${e?.title ?? ""}${e?.company?.name ? ` @ ${e.company.name}` : ""}\n${s.rank_reason}${s.why_now ? `\n_Why now:_ ${s.why_now.trigger} — ${s.why_now.why_buying}` : ""}${e?.work_email?.email ? `\n✉ ${e.work_email.email}` : ""}${s.warm_path ? `\n🔗 warm via ${s.warm_path.via}` : ""}`,
      },
      accessory: { type: "button", text: { type: "plain_text", text: "Review & send →" }, url: `${appUrl}/dashboard?focus=${encodeURIComponent(s.signal_id)}`, action_id: `open_${s.signal_id}` },
    });
  }
  return blocks;
}

export const slackSink: Sink = {
  name: "slack",
  async push(items) {
    if (items.length === 0) return;
    const appUrl = process.env.LITMUS_APP_URL || "https://litmus-roan.vercel.app";
    const blocks = slackBlocks(items, appUrl);
    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL;
    const webhook = process.env.SLACK_WEBHOOK_URL;

    if (token && channel) {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel, blocks, text: `Litmus: ${items.length} prospects to work today` }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(`Slack chat.postMessage failed: ${j.error}`);
    } else if (webhook) {
      const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks }) });
      if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`);
    } else {
      throw new Error("Slack not configured (set SLACK_BOT_TOKEN+SLACK_CHANNEL or SLACK_WEBHOOK_URL)");
    }
  },
};

// ---------- HubSpot (stretch) ----------
// No Enterprise / no classic cards. Fallback that works on ANY free portal:
// PATCH custom properties on the contact + post a Note via the CRM API.
// Env: HUBSPOT_TOKEN (private-app access token)
// Writes litmus_score / litmus_reason / litmus_why_now onto matched contacts.
// GUARDED: writes to a real CRM only when HUBSPOT_WRITE_ARMED=1. Matches by email.
export const hubspotSink: Sink = {
  name: "hubspot",
  async push(items) {
    if (process.env.HUBSPOT_WRITE_ARMED !== "1") {
      throw new Error("HubSpot write not armed — set HUBSPOT_WRITE_ARMED=1 to write to the CRM");
    }
    // Try custom litmus_* properties (needs crm.schemas scope); fall back to the standard `message`
    // field so it works with just contacts.write. Either way the intel lands on the record.
    const { ensureLitmusProperties, searchContactByEmail, patchContact } = await import("./hubspot");
    let customOk = true;
    try { await ensureLitmusProperties(); } catch { customOk = false; }
    for (const s of items) {
      const email = s.enriched?.work_email?.email;
      if (!email) continue;
      const c = await searchContactByEmail(email);
      if (!c) continue;
      const summary = `🧪 Litmus ${s.score}/100 — ${s.rank_reason}${s.why_now ? ` · Why now: ${s.why_now.why_buying}` : ""}`;
      const props: Record<string, string> = { message: summary };
      if (customOk) {
        props.litmus_score = String(s.score);
        props.litmus_reason = s.rank_reason;
        props.litmus_why_now = s.why_now ? `${s.why_now.trigger} — ${s.why_now.why_buying}` : "";
      }
      await patchContact(c.id, props);
    }
  },
};

// ---------- Dashboard (our own page) ----------
// The ranked worklist, served from the same process. Reads from the scored cache.
export const dashboardSink: Sink = {
  name: "dashboard",
  async push(_items) {
    // no-op: the dashboard reads scored results directly from the store/cache.
  },
};
