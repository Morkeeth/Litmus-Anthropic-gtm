// Litmus MCP server — the "agents get a tool" door over the headless engine.
// Any MCP client (Claude Desktop, Claude Code, a customer's own agent) can call Litmus to
// score its intent firehose. Same scoring engine as the dashboard and CLI.
//
// Connect (Claude Code):  claude mcp add litmus -- npx tsx /ABS/PATH/bin/litmus-mcp.ts
// Transport: stdio.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ClientContext } from "../src/types";

// --- standalone .env loader ---
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function loadContext(): ClientContext {
  const p = join(process.cwd(), "client-context.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  return {
    what_we_sell: "AI sales-intelligence platform that scores intent and drafts outreach for B2B revenue teams.",
    icp: "B2B SaaS, 200-2000 employees, US. VP Sales / Head of RevOps.",
    tone_of_voice: "Direct, insight-led, no fluff.",
    why_good: "Recent VP Sales/RevOps change; scaling GTM headcount; using a competitor.",
  };
}

const server = new McpServer({ name: "litmus", version: "0.1.0" });

// Tool 1: score today's firehose into a ranked brief.
server.tool(
  "litmus_todays_brief",
  "Score the intent firehose against what the seller sells and return the top-N ranked prospects, each with a pinpointed why-now (trigger/what-changed/why-buying), cited factors, and drafts. Source: sillage-agent (verify Sillage detections against FullEnrich), sillage, fullenrich (ICP search), or hubspot.",
  {
    source: z.enum(["sillage-agent", "sillage", "fullenrich", "hubspot"]).optional(),
    top: z.number().int().min(1).max(20).optional(),
  },
  async ({ source = "sillage-agent", top = 5 }) => {
    const ctx = loadContext();
    const { runSillageAgent } = await import("../lib/agent-loop");
    const { runIcpWorkflow, runFromSillage, runFromHubspot } = await import("../lib/pipeline");
    const prospects =
      source === "sillage-agent" ? await runSillageAgent(ctx, top)
      : source === "sillage" ? await runFromSillage(ctx, top)
      : source === "hubspot" ? await runFromHubspot(ctx, top)
      : await runIcpWorkflow(ctx, top, ["Stripe", "Ramp", "Notion", "Vercel", "Brex"]);
    return { content: [{ type: "text", text: JSON.stringify(prospects, null, 2) }] };
  },
);

// Tool 2: score a single contact you already have.
server.tool(
  "litmus_score_contact",
  "Score one contact you already have (name + optional title/company/email). Returns the Litmus score, why-now, cited factors, and drafts.",
  {
    full_name: z.string(),
    title: z.string().optional(),
    company: z.string().optional(),
    email: z.string().optional(),
  },
  async ({ full_name, title, company, email }) => {
    const ctx = loadContext();
    const { runFromContacts } = await import("../lib/pipeline");
    const scored = await runFromContacts(ctx, [{ full_name, title, company, email }], 1);
    return { content: [{ type: "text", text: JSON.stringify(scored[0] ?? {}, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("litmus MCP server ready (stdio)");
