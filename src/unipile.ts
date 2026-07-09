// Action layer — Unipile. Sends the drafted email + LinkedIn message on behalf of the rep.
// Verified against https://developer.unipile.com/docs (Jul 9).
//
// Base: https://{YOUR_DSN}/api/v1   Header: X-API-KEY: <token>   (DSN + token from dashboard)
// Official Node SDK exists (unipile-node-sdk); this raw-REST client is the zero-dep fallback.
//
// Connecting a rep's Gmail + LinkedIn ("on behalf of"): hosted auth wizard, one call:
//   POST /hosted/accounts/link { type:"create", providers:["GOOGLE","LINKEDIN"], api_url, notify_url, name }
//   -> returns { url } to redirect the rep through; webhook delivers account_id on success.
//
// DEMO CONSTRAINT: live-send email + a LinkedIn message to an EXISTING connection on an
// AGED account. LinkedIn blocks invites from fresh accounts — cold invite is pitch-only.

const DSN = process.env.UNIPILE_DSN; // e.g. api8.unipile.com:13xxx
const KEY = process.env.UNIPILE_API_KEY;

function base() {
  return `https://${DSN}/api/v1`;
}
function headers() {
  return { "X-API-KEY": KEY as string, "Content-Type": "application/json" };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Unipile ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

// List connected accounts (find the rep's account_id / linkedin account).
export async function listAccounts() {
  return call<{ items: any[] }>("GET", "/accounts");
}

// (b) Send email via the rep's Gmail. POST /emails
export async function sendEmail(params: {
  account_id: string;
  to: Array<{ identifier: string; display_name?: string }>;
  subject: string;
  body: string;
}) {
  return call("POST", "/emails", params);
}

// (c) Send a LinkedIn message to an existing chat/connection. POST /chats/{chat_id}/messages
export async function sendLinkedInMessage(chatId: string, text: string) {
  return call("POST", `/chats/${chatId}/messages`, { text });
}

// Start a new 1:1 LinkedIn chat (recipient must be reachable — existing connection for the demo).
export async function startLinkedInChat(params: {
  account_id: string;
  attendees_ids: string[];
  text: string;
}) {
  return call("POST", "/chats", params);
}

// Generate a hosted-auth link to connect a rep's accounts (setup, done once at kickoff).
export async function hostedAuthLink(params: {
  api_url: string;
  notify_url: string;
  name: string; // our internal user id
}) {
  return call<{ url: string }>("POST", "/hosted/accounts/link", {
    type: "create",
    providers: ["GOOGLE", "LINKEDIN"],
    ...params,
  });
}
