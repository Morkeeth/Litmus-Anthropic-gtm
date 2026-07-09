// Litmus CLI — the terminal door over the headless engine. Same scoring, no browser.
// Commands:
//   litmus brief   [--source sillage-agent|sillage|fullenrich|hubspot] [--top 5] [--json]
//   litmus score   "<name>" [--company acme.com] [--title "VP Sales"]
//   litmus sources                 # what's connected
//   litmus help
// Loads .env itself (standalone, not via Next).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ClientContext } from "../src/types";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ---- ANSI (zero-dep) ----
const on = !!process.stdout.isTTY; // colors + spinner only in a real terminal (clean when piped/redirected)
const e = (n: string) => (on ? n : "");
const C = {
  reset: e("\x1b[0m"), b: e("\x1b[1m"), dim: e("\x1b[2m"),
  green: e("\x1b[32m"), yellow: e("\x1b[33m"), red: e("\x1b[31m"),
  cyan: e("\x1b[36m"), gray: e("\x1b[90m"), mag: e("\x1b[35m"), white: e("\x1b[97m"),
};
const paint = (s: number) => (s >= 70 ? C.green : s >= 40 ? C.yellow : C.red);
// the litmus reading — acid (react now) vs base (inert)
const verdict = (p: any) => {
  const real = p.factors?.find((f: any) => f.key === "real")?.value ?? 0;
  if (real < 0.3) return `${C.cyan}🧪 BASE${C.reset}`;
  if (p.score >= 70) return `${C.red}🧪 ACID${C.reset}`;
  if (p.score >= 45) return `${C.yellow}🧪 NEUTRAL${C.reset}`;
  return `${C.cyan}🧪 WEAK BASE${C.reset}`;
};

function banner() {
  console.log(`\n${C.mag}${C.b}▓▓ LITMUS${C.reset}  ${C.dim}the scoring layer for intent${C.reset}\n`);
}

// live spinner for the slow scoring calls
function spinner(text: string) {
  if (!on) { process.stdout.write(`${text}\n`); return () => {}; }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const id = setInterval(() => process.stdout.write(`\r${C.cyan}${frames[i++ % frames.length]}${C.reset} ${C.dim}${text}${C.reset}`), 80);
  return () => { clearInterval(id); process.stdout.write("\r" + " ".repeat(text.length + 6) + "\r"); };
}
const rule = () => console.log(`${C.gray}${"─".repeat(56)}${C.reset}`);

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
const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const has = (name: string) => process.argv.includes(`--${name}`);

function printProspect(p: any, i: number) {
  const e2 = p.enriched ?? {};
  const bar = paint(p.score) + "█".repeat(Math.round(p.score / 10)).padEnd(10, `${C.gray}·`) + C.reset;
  console.log(`${C.gray}${String(i + 1).padStart(2)}${C.reset}  ${paint(p.score)}${C.b}${String(p.score).padStart(3)}${C.reset} ${bar}  ${verdict(p)}  ${C.white}${C.b}${e2.full_name ?? "?"}${C.reset} ${C.dim}${e2.title ?? ""}${e2.company?.name ? ` @ ${e2.company.name}` : ""}${C.reset}`);
  console.log(`     ${C.gray}${p.rank_reason}${C.reset}`);
  if (p.why_now) console.log(`     ${C.cyan}⚡ ${p.why_now.trigger}${C.reset}`);
  if (e2.work_email?.email) console.log(`     ${C.dim}✉ ${e2.work_email.email}${e2.mobile?.number ? `   ☎ ${e2.mobile.number}` : ""}${C.reset}`);
  console.log("");
}

async function cmdBrief() {
  const source = arg("source", "sillage-agent")!;
  const top = parseInt(arg("top", "5")!, 10);
  const ctx = loadContext();
  banner();
  const stop = spinner(`scoring the ${source} firehose — verifying, ranking…`);

  const { runSillageAgent } = await import("../lib/agent-loop");
  const { runIcpWorkflow, runFromSillage, runFromHubspot } = await import("../lib/pipeline");
  const prospects: any[] = await (
    source === "sillage-agent" ? runSillageAgent(ctx, top)
    : source === "sillage" ? runFromSillage(ctx, top)
    : source === "hubspot" ? runFromHubspot(ctx, top)
    : runIcpWorkflow(ctx, top, ["Stripe", "Ramp", "Notion", "Vercel", "Brex"]));
  stop();

  if (has("json")) { console.log(JSON.stringify(prospects, null, 2)); return; }

  console.log(`${C.b}today's brief${C.reset}  ${C.dim}${source} · ${prospects.length} to work${C.reset}`);
  rule();
  prospects.forEach(printProspect);
  const hot = prospects.filter((p) => p.score >= 70).length;
  const noise = prospects.filter((p) => (p.factors?.find((f: any) => f.key === "real")?.value ?? 0) < 0.3).length;
  rule();
  console.log(`  ${C.green}${C.b}${hot}${C.reset} hot   ${C.yellow}${C.b}${prospects.length - hot - noise}${C.reset} watch   ${C.red}${C.b}${noise}${C.reset} noise killed   ${C.dim}·  approve in the dashboard or 'litmus score' one${C.reset}\n`);
}

async function cmdScore() {
  const name = process.argv[3];
  if (!name || name.startsWith("--")) { console.log(`usage: litmus score "Jane Doe" --company acme.com --title "VP Sales"`); return; }
  banner();
  const stop = spinner(`scoring ${name}…`);
  const { runFromContacts } = await import("../lib/pipeline");
  const scored = await runFromContacts(loadContext(), [{ full_name: name, company: arg("company"), title: arg("title") }], 1);
  stop();
  if (!scored.length) { console.log(`  ${C.red}no result${C.reset}\n`); return; }
  rule();
  printProspect(scored[0], 0);
}

function cmdSources() {
  banner();
  const rows: [string, string, boolean][] = [
    ["Anthropic", "the scoring engine", !!process.env.ANTHROPIC_API_KEY],
    ["FullEnrich", "verify + email/phone", !!process.env.FULLENRICH_API_KEY],
    ["Sillage", "intent signals", !!process.env.SILLAGE_API_KEY],
    ["HubSpot", "CRM contacts", !!process.env.HUBSPOT_TOKEN],
    ["Unipile", "email + LinkedIn send", !!process.env.UNIPILE_API_KEY],
    ["Slack", "delivery", !!process.env.SLACK_BOT_TOKEN],
  ];
  for (const [n, d, ok] of rows) {
    console.log(`  ${ok ? C.green + "●" : C.gray + "○"}${C.reset} ${C.b}${n.padEnd(11)}${C.reset} ${C.dim}${d}${C.reset}`);
  }
  console.log("");
}

function help() {
  banner();
  console.log(`  ${C.b}litmus brief${C.reset}   ${C.dim}--source sillage-agent|sillage|fullenrich|hubspot  --top 5  --json${C.reset}`);
  console.log(`  ${C.b}litmus score${C.reset}   ${C.dim}"Jane Doe" --company acme.com --title "VP Sales"${C.reset}`);
  console.log(`  ${C.b}litmus sources${C.reset} ${C.dim}what's connected${C.reset}\n`);
}

const cmd = process.argv[2] ?? "brief";
const run =
  cmd === "brief" ? cmdBrief()
  : cmd === "score" ? cmdScore()
  : cmd === "sources" ? Promise.resolve(cmdSources())
  : Promise.resolve(help());
run.catch((err: any) => { console.error(`${C.red}litmus error:${C.reset}`, err?.message ?? err); process.exit(1); });
