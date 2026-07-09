// Entry point — the pipeline runner + server. Cache-first for the demo.
// Flow:  signals (Sillage/mock) -> normalize -> enrich (FullEnrich) -> scoreAndRank -> sink(s)
//        the /send endpoint fires Unipile; the dashboard renders the ranked worklist.
// TODO Thursday: cache-first wrapper, HTTP server (API + dashboard + Slack action handler).

import { readFileSync } from "node:fs";
import type { Signal, ClientContext } from "./types";
import { scoreAndRank, type ScoreInput, type ScoreConfig } from "./score";
import { slackSink } from "./sinks";

// Engine smoke-test CLI (the web app is the Next.js app/). Live path: Sillage MCP -> normalize.
function loadSignals(): Signal[] {
  return JSON.parse(readFileSync(new URL("../mock/signals.json", import.meta.url), "utf8"));
}

async function main() {
  const signals = loadSignals();
  // TODO: enrich each via FullEnrich (normalize.ts), build curated accountContext.
  const inputs: ScoreInput[] = signals.map((signal) => ({ signal }));
  const clientContext = {} as ClientContext; // TODO: load client-context.md
  const cfg: ScoreConfig = { clientContext, topN: 7 };
  const ranked = await scoreAndRank(inputs, cfg); // TODO: implement scoreSignal
  await slackSink.push(ranked);
  console.log(`Scored + ranked ${ranked.length} signals -> Slack.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
