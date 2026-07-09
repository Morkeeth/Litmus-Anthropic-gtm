import { NextResponse } from "next/server";
import { runIcpWorkflow, runFromContacts, runFromEmails } from "../../../lib/pipeline";
import type { ClientContext } from "../../../src/types";

// LIVE workflow. Source-optional:
//   { clientContext, contacts:[...] }  -> Flow C: score a CRM/CSV list (no FullEnrich search, no Sillage)
//   { clientContext, emails:[...] }    -> Flow D: FullEnrich reverse-email lookup -> score
//   { clientContext }                  -> Flow A: FullEnrich people/search by ICP -> score
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
    };
    const { clientContext, topN = 7, contacts, emails } = body;

    let prospects;
    if (contacts?.length) {
      prospects = await runFromContacts(clientContext, contacts, topN); // no FullEnrich/Sillage needed
    } else if (emails?.length) {
      if (!process.env.FULLENRICH_API_KEY) return NextResponse.json({ error: "reverse-email needs FULLENRICH_API_KEY" }, { status: 400 });
      prospects = await runFromEmails(clientContext, emails, topN);
    } else {
      if (!process.env.FULLENRICH_API_KEY) return NextResponse.json({ error: "ICP search needs FULLENRICH_API_KEY (or pass contacts[])" }, { status: 400 });
      prospects = await runIcpWorkflow(clientContext, topN);
    }
    return NextResponse.json({ prospects, source: "live", scored_at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
