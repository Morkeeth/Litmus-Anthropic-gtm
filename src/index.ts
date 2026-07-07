// Entry point. Reads signals, runs verify (cache-first for the demo), serves the UI.
// TODO Thursday: cache-first wrapper, single-page UI serving the three verdict cards.

import { readFileSync } from "node:fs";
import type { Signal } from "./types";
// import { verifySignal } from "./verify";

function loadSignals(): Signal[] {
  return JSON.parse(readFileSync(new URL("../mock/signals.json", import.meta.url), "utf8"));
}

async function main() {
  const signals = loadSignals();
  console.log(`Loaded ${signals.length} signals. Verify loop not implemented yet.`);
  // for (const s of signals) console.log(await verifySignal(s));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
