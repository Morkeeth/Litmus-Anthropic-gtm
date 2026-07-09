// Litmus CLI — the terminal door over the headless engine. Same scoring, no browser.
// Usage:
//   npx tsx bin/litmus.ts brief [--source sillage-agent|sillage|fullenrich|hubspot] [--top 5] [--json]
// Loads .env itself (standalone, not via Next).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ClientContext } from "../src/types";

// --- tiny .env loader (no dep) ---
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// --- context: client-context.json if present, else a demo default ---
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

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const cmd = process.argv[2] ?? "brief";
  if (cmd !== "brief") {
    console.log("usage: litmus brief [--source sillage-agent|sillage|fullenrich|hubspot] [--top 5] [--json]");
    process.exit(1);
  }
  const source = arg("source", "fullenrich")!;
  const top = parseInt(arg("top", "5")!, 10);
  const ctx = loadContext();

  const { runSillageAgent } = await import("../lib/agent-loop");
  const { runIcpWorkflow, runFromSillage, runFromHubspot } = await import("../lib/pipeline");

  const run =
    source === "sillage-agent" ? runSillageAgent(ctx, top)
    : source === "sillage" ? runFromSillage(ctx, top)
    : source === "hubspot" ? runFromHubspot(ctx, top)
    : runIcpWorkflow(ctx, top, ["Stripe", "Ramp", "Notion", "Vercel", "Brex"]);

  const prospects = await run;

  if (arg("json") !== undefined || process.argv.includes("--json")) {
    console.log(JSON.stringify(prospects, null, 2));
    return;
  }

  console.log(`\n  LITMUS — today's brief (${source}) · ${prospects.length} to work\n`);
  for (const p of prospects as any[]) {
    const e = p.enriched ?? {};
    const bar = "█".repeat(Math.round(p.score / 10)).padEnd(10, "·");
    console.log(`  ${String(p.score).padStart(3)} ${bar}  ${e.full_name ?? "?"} — ${e.title ?? ""}${e.company?.name ? ` @ ${e.company.name}` : ""}`);
    console.log(`      ${p.rank_reason}`);
    if (p.why_now) console.log(`      why-now: ${p.why_now.trigger}`);
    if (e.work_email?.email) console.log(`      ✉ ${e.work_email.email}`);
    console.log("");
  }
}

main().catch((e) => { console.error("litmus error:", e?.message ?? e); process.exit(1); });
