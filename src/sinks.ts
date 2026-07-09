// Output layer — agnostic sinks. The engine emits ScoredSignal; a thin adapter renders
// it per destination. Sinks are independent: adding one never touches the engine.
// "We just create an output" — Slack for the demo, CRM adapters as the story.

import type { ScoredSignal } from "./types";

export interface Sink {
  name: string;
  push(items: ScoredSignal[]): Promise<void>;
}

// ---------- Slack (guaranteed demo sink) ----------
// Incoming webhook + Block Kit card. 5-min setup, zero account gating.
// Env: SLACK_WEBHOOK_URL
export const slackSink: Sink = {
  name: "slack",
  async push(items) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) throw new Error("SLACK_WEBHOOK_URL not set");
    for (const s of items) {
      const blocks = [
        { type: "header", text: { type: "plain_text", text: `🔥 ${s.score}/100 — ${s.rank_reason}` } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Contact:*\n${s.enriched?.full_name ?? "?"} — ${s.enriched?.title ?? ""}` },
            { type: "mrkdwn", text: `*Reachable:*\n${s.enriched?.work_email?.email ?? "—"}` },
            { type: "mrkdwn", text: `*Warm path:*\n${s.warm_path ? `via ${s.warm_path.via}` : "cold"}` },
            { type: "mrkdwn", text: `*Signal:*\n${s.signal_id}` },
          ],
        },
        // action buttons wire to the /send endpoint (Unipile) in the app
        {
          type: "actions",
          elements: [
            { type: "button", text: { type: "plain_text", text: "Send email" }, value: s.signal_id, action_id: "send_email" },
            { type: "button", text: { type: "plain_text", text: "Send LinkedIn" }, value: s.signal_id, action_id: "send_linkedin" },
          ],
        },
      ];
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
    }
  },
};

// ---------- HubSpot (stretch) ----------
// No Enterprise / no classic cards. Fallback that works on ANY free portal:
// PATCH custom properties on the contact + post a Note via the CRM API.
// Env: HUBSPOT_TOKEN (private-app access token)
export const hubspotSink: Sink = {
  name: "hubspot",
  async push(_items) {
    // TODO stretch: PATCH /crm/v3/objects/contacts/{id} { properties: { litmus_score, litmus_reason } }
    //             + POST /crm/v3/objects/notes with association to the contact.
    // Modern App Card (React UI extension in a free Dev Test Account) is the wow version if time allows.
    throw new Error("TODO stretch: HubSpot sink (PATCH properties + Note)");
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
