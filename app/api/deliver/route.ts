import { NextResponse } from "next/server";
import { slackSink, hubspotSink } from "../../../src/sinks";
import { sendChatMessage } from "../../../src/unipile";

// Deliver the ranked brief to a destination — Slack, Telegram, or HubSpot. (CLI is `npm run cli`.)
// Same brief, any surface — "we just create an output."
export const runtime = "nodejs";
export const maxDuration = 60;
const TG = process.env.LITMUS_TELEGRAM_CHAT || "FrfNM9VCU_ymELEC28hD-A";

export async function POST(req: Request) {
  const { destination, prospects = [] } = (await req.json().catch(() => ({}))) as { destination?: string; prospects?: any[] };
  try {
    if (destination === "Slack") {
      await slackSink.push(prospects);
    } else if (destination === "HubSpot") {
      await hubspotSink.push(prospects); // writes litmus_score / reason / why_now onto matched contacts
    } else if (destination === "Telegram") {
      const lines = [
        "🧪 *Litmus — today's brief*",
        ...prospects.slice(0, 5).map((s, i) => `${i + 1}. *${s.score}* · ${s.enriched?.full_name ?? "?"} — ${s.enriched?.title ?? ""}${s.enriched?.company?.name ? ` @ ${s.enriched.company.name}` : ""}\n${s.rank_reason}`),
      ];
      await sendChatMessage(TG, lines.join("\n\n"));
    } else {
      return NextResponse.json({ error: "unknown destination" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, delivered: destination, count: prospects.length });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
