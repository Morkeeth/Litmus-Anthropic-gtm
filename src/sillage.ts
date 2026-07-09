// Sillage client — MCP over HTTP (JSON-RPC 2.0), authenticated with the Bearer API key.
// Confirmed Jul 9: the sk_live key authenticates the MCP directly, no OAuth flow needed.
// Endpoint: https://api.getsillage.com/api/mcp/v2
//
// Tool results come back as { result: { content:[{type:"text",text:"<json>"}], structuredContent? } }.
// We prefer structuredContent, falling back to parsing content[0].text.

const ENDPOINT = "https://api.getsillage.com/api/mcp/v2";

let _id = 0;

async function callTool<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SILLAGE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await res.text();
  // streamable HTTP may return SSE-framed data; grab the JSON payload either way
  const jsonStr = text.startsWith("data:") ? text.replace(/^data:\s*/gm, "").trim() : text;
  const parsed = JSON.parse(jsonStr);
  if (parsed.error) throw new Error(`Sillage ${name}: ${parsed.error.message ?? JSON.stringify(parsed.error)}`);
  const r = parsed.result;
  if (r?.isError) throw new Error(`Sillage ${name}: ${r.content?.[0]?.text ?? "tool error"}`);
  if (r?.structuredContent) return r.structuredContent as T;
  const t = r?.content?.[0]?.text;
  return (t ? JSON.parse(t) : r) as T;
}

export async function listTools(): Promise<any> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SILLAGE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method: "tools/list" }),
  });
  return (await res.json()).result;
}

// ---------- Read ----------
export const getSetupState = () => callTool("sillage_v2_get_setup_state");
export const getPersona = () => callTool<any>("sillage_v2_get_persona");
export const listSignals = (args: { page_size?: number; agent_id?: number; cursor?: string } = {}) =>
  callTool<{ data: any[]; meta: { next_cursor: string | null; has_more: boolean } }>("sillage_v2_list_signals", args);
export const getSignal = (id: number) => callTool("sillage_v2_get_signal", { id });
export const getLead = (lead_id: number) => callTool<any>("sillage_v2_get_lead", { lead_id });
export const getCompanyMapping = (args: Record<string, unknown>) => callTool("sillage_v2_get_company_mapping", args);
export const getContents = (args: Record<string, unknown> = {}) => callTool("sillage_v2_get_contents", args);

// ---------- Setup (seed a fresh workspace so signals start ingesting) ----------
export const upsertPersona = (args: { job_title: string; location: string; [k: string]: unknown }) =>
  callTool("sillage_v2_upsert_persona", args);
export const addTopAccounts = (accounts: unknown[]) => callTool("sillage_v2_add_top_accounts", { accounts });
export const createAgent = (args: Record<string, unknown>) => callTool("sillage_v2_create_agent", args);
