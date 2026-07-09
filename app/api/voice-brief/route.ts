import { NextResponse } from "next/server";
import WebSocket from "ws";

// Hand a prospect brief to the xAI Grok Voice agent — it speaks it back (audio streams; we return
// the transcript). The "agents get a tool" door, made audible. Local only (XAI_API_KEY in .env).
export const runtime = "nodejs";
export const maxDuration = 30;

const AGENT = process.env.XAI_VOICE_AGENT || "agent_VPmkqaAo5Yihq7Hg";

export async function POST(req: Request) {
  if (!process.env.XAI_API_KEY) return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 400 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };

  const transcript = await new Promise<string>((resolve) => {
    let t = "";
    const ws = new WebSocket(`wss://api.x.ai/v1/realtime?agent_id=${AGENT}`, {
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    });
    const done = () => { try { ws.close(); } catch {} resolve(t.trim()); };
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "session.update", session: { modalities: ["text", "audio"], instructions: "You are Litmus, the sales rep's morning voice briefing. Read the prospect brief crisply and warmly in 2-3 sentences — who, why now, and the one move." } }));
      ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: text || "Brief me." }] } }));
      ws.send(JSON.stringify({ type: "response.create", response: { modalities: ["text", "audio"] } }));
    });
    ws.on("message", (raw) => {
      const e = JSON.parse(raw.toString());
      if (e.type === "response.output_audio_transcript.delta" || e.type === "response.output_text.delta") t += e.delta || "";
      else if (e.type === "response.done" || e.type === "response.completed") done();
    });
    ws.on("error", () => done());
    setTimeout(done, 16000);
  });

  return NextResponse.json({ transcript });
}
