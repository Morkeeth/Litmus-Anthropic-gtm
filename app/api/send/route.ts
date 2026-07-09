import { NextResponse } from "next/server";
import { accountIdByType, sendEmail } from "../../../src/unipile";

// Fire an approved draft via Unipile. HARD SAFETY GUARD:
// - This sends REAL messages from the connected Gmail/Telegram.
// - External recipients are REFUSED unless { confirmExternal: true } is explicitly passed.
// - Default recipient is the account owner (self-test) — proves the pipe without touching prospects.
// Never call this automatically; only on an explicit user action.
export const runtime = "nodejs";

const SELF_EMAIL = "omorke@gmail.com"; // owner inbox — safe self-test target

export async function POST(req: Request) {
  if (!process.env.UNIPILE_API_KEY || !process.env.UNIPILE_DSN) {
    return NextResponse.json({ error: "Unipile not configured (local .env only)" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    channel?: "email";
    to?: string;
    subject?: string;
    text?: string;
    confirmExternal?: boolean;
  };
  const to = body.to ?? SELF_EMAIL;
  const isExternal = to.toLowerCase() !== SELF_EMAIL.toLowerCase();

  // ARMING SWITCH: nothing transmits unless LITMUS_SEND_ARMED=1 in the environment.
  // Default = dry-run: returns what WOULD be sent, sends nothing. Protects the live Gmail/Telegram.
  if (process.env.LITMUS_SEND_ARMED !== "1") {
    return NextResponse.json({ ok: true, dry_run: true, would_send: { channel: "email", to, subject: body.subject }, note: "not armed — set LITMUS_SEND_ARMED=1 to actually send" });
  }
  if (isExternal && !body.confirmExternal) {
    return NextResponse.json(
      { error: "external send blocked — pass confirmExternal:true to send to a non-owner address", to },
      { status: 403 },
    );
  }
  try {
    const account_id = await accountIdByType("GOOGLE");
    if (!account_id) return NextResponse.json({ error: "no Gmail account connected" }, { status: 400 });
    const res = await sendEmail({
      account_id,
      to: [{ identifier: to }],
      subject: body.subject ?? "Litmus test",
      body: body.text ?? "Test send from Litmus.",
    });
    return NextResponse.json({ ok: true, to, isExternal, res });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
