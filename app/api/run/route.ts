import { NextResponse } from "next/server";
import { runIcpWorkflow, runFromContacts, runFromEmails, runFromSillage, runFromHubspot } from "../../../lib/pipeline";
import { slackSink, hubspotSink } from "../../../src/sinks";
import type { ClientContext } from "../../../src/types";

// LIVE workflow. Source + destination are config-driven:
//   contacts[] -> CRM/CSV (no FullEnrich/Sillage)   emails[] -> reverse-email
//   source:"sillage" -> Sillage intent detections   default -> FullEnrich ICP search
// destination:"Slack" -> also push the brief to the Slack sink.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "missing ANTHROPIC_API_KEY" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as {
      clientContext: ClientContext;
      topN?: number;
      contacts?: any[];
      emails?: string[];
      source?: "sillage" | "hubspot" | "fullenrich";
      destination?: string;
    };
    const { clientContext, topN = 5, contacts, emails, source, destination } = body;

    let prospects;
    if (contacts?.length) {
      prospects = await runFromContacts(clientContext, contacts, topN);
    } else if (emails?.length) {
      if (!process.env.FULLENRICH_API_KEY) return NextResponse.json({ error: "reverse-email needs FULLENRICH_API_KEY" }, { status: 400 });
      prospects = await runFromEmails(clientContext, emails, topN);
    } else if (source === "sillage") {
      if (!process.env.SILLAGE_API_KEY) return NextResponse.json({ error: "Sillage source needs SILLAGE_API_KEY" }, { status: 400 });
      prospects = await runFromSillage(clientContext, topN);
    } else if (source === "hubspot") {
      if (!process.env.HUBSPOT_TOKEN) return NextResponse.json({ error: "HubSpot source needs HUBSPOT_TOKEN" }, { status: 400 });
      prospects = await runFromHubspot(clientContext, topN);
    } else {
      if (!process.env.FULLENRICH_API_KEY) return NextResponse.json({ error: "ICP search needs FULLENRICH_API_KEY (or pass contacts[])" }, { status: 400 });
      prospects = await runIcpWorkflow(clientContext, topN);
    }

    // Deliver to the chosen destination (dashboard is the default — the response IS the delivery).
    let delivered = "dashboard";
    if (destination === "Slack" && (process.env.SLACK_BOT_TOKEN || process.env.SLACK_WEBHOOK_URL)) {
      try { await slackSink.push(prospects); delivered = "slack"; } catch { /* non-fatal */ }
    } else if (destination === "HubSpot" && process.env.HUBSPOT_WRITE_ARMED === "1") {
      try { await hubspotSink.push(prospects); delivered = "hubspot"; } catch { /* non-fatal */ }
    }

    return NextResponse.json({ prospects, source: "live", delivered, scored_at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
