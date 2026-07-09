import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Auto-draft the client context from a company name/website. Anthropic researches the company
// (web search) and drafts what-we-sell / ICP / competitors / tone / why-good. The user tweaks.
// Kills the "free-write everything" friction in onboarding.
export const runtime = "nodejs";
export const maxDuration = 60;
const MODEL = process.env.LITMUS_MODEL || "claude-sonnet-5";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no ANTHROPIC_API_KEY" }, { status: 400 });
  const { company } = (await req.json().catch(() => ({}))) as { company?: string };
  if (!company) return NextResponse.json({ error: "company required" }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1400,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as any],
      system:
        "You research a company and draft a GTM 'client context' for a sales-scoring tool. " +
        "Research the company's website and LinkedIn to learn what they sell, who they sell to, and their competitors. " +
        "Then output ONLY a JSON object (no prose, no markdown fences) with keys: " +
        "what_we_sell (1-2 sentences), icp (target company profile + the personas they win with + disqualifiers), " +
        "competitors, tone_of_voice (how they'd write outreach), why_good (2-3 concrete rules for what makes a prospect hot for them, e.g. 'recent VP Sales change').",
      messages: [{ role: "user", content: `Draft the client context for: ${company}` }],
    });
    const text = res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: "could not draft — try a clearer company name/domain" }, { status: 502 });
    const raw = JSON.parse(m[0]) as Record<string, unknown>;
    // coerce every value to a plain string the onboarding fields can hold
    const str = (v: unknown): string =>
      typeof v === "string" ? v
      : Array.isArray(v) ? v.map(str).join("; ")
      : v && typeof v === "object" ? Object.values(v).map(str).join(" · ")
      : String(v ?? "");
    const context = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, str(v)]));
    return NextResponse.json({ context });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
