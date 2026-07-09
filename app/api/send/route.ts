import { NextResponse } from "next/server";
import { accountIdByType, sendEmail, sendChatMessage } from "../../../src/unipile";

// Fire an approved draft via Unipile — email or telegram. SAFE by design:
// - dry-run unless LITMUS_SEND_ARMED=1
// - email defaults to the owner's own inbox; external addresses refused without confirmExternal
// - telegram goes to the owner's own "Litmus Hackathon" chat (LITMUS_TELEGRAM_CHAT)
// So on stage it sends REAL messages, but only to the owner's own accounts. Never touches a prospect.
export const runtime = "nodejs";

const SELF_EMAIL = process.env.LITMUS_SELF_EMAIL || "omorke@gmail.com";
const TG_CHAT = process.env.LITMUS_TELEGRAM_CHAT || "FrfNM9VCU_ymELEC28hD-A"; // owner's own chat

export async function POST(req: Request) {
  if (!process.env.UNIPILE_API_KEY || !process.env.UNIPILE_DSN) {
    return NextResponse.json({ error: "Unipile not configured (local .env only)" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    channel?: "email" | "telegram";
    to?: string; subject?: string; text?: string; confirmExternal?: boolean;
  };
  const channel = body.channel ?? "email";

  if (process.env.LITMUS_SEND_ARMED !== "1") {
    return NextResponse.json({ ok: true, dry_run: true, would_send: { channel, subject: body.subject }, note: "not armed — set LITMUS_SEND_ARMED=1" });
  }
  try {
    if (channel === "telegram") {
      const res = await sendChatMessage(TG_CHAT, body.text ?? "Litmus test");
      return NextResponse.json({ ok: true, channel: "telegram", to: "your Telegram", res });
    }
    const to = body.to ?? SELF_EMAIL;
    if (to.toLowerCase() !== SELF_EMAIL.toLowerCase() && !body.confirmExternal) {
      return NextResponse.json({ error: "external send blocked — pass confirmExternal:true", to }, { status: 403 });
    }
    const account_id = await accountIdByType("GOOGLE");
    if (!account_id) return NextResponse.json({ error: "no Gmail account connected" }, { status: 400 });
    const res = await sendEmail({ account_id, to: [{ identifier: to }], subject: body.subject ?? "Litmus", body: body.text ?? "" });
    return NextResponse.json({ ok: true, channel: "email", to, res });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
