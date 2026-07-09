"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Draft = { channel: string; subject?: string; body: string };
type Factor = { key: string; value: number; detail: string };
type Prospect = {
  signal_id: string;
  score: number;
  rank_reason: string;
  factors: Factor[];
  enriched?: { full_name?: string; title?: string; company?: { name?: string }; work_email?: { email: string; status: string }; mobile?: { number: string } };
  warm_path?: { via: string; relationship: string };
  drafts: Draft[];
};

const scoreClass = (s: number) => (s >= 70 ? "hot" : s >= 40 ? "mid" : "dead");
const pips = (v: number) => "●●●●".slice(0, Math.round(v * 4)) + "○○○○".slice(0, 4 - Math.round(v * 4));
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default function Dashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [state, setState] = useState<Record<string, "sent" | "killed">>({});
  const [brand, setBrand] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const c = localStorage.getItem("litmus_context");
    if (c) { try { setBrand(JSON.parse(c).what_we_sell?.slice(0, 60) ?? ""); } catch {} }
    fetch("/api/prospects").then((r) => r.json()).then((d) => { setProspects(d.prospects ?? []); setLoading(false); });
  }, []);

  async function act(id: string, verdict: "up" | "down", reason?: string) {
    setState((s) => ({ ...s, [id]: verdict === "up" ? "sent" : "killed" }));
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_id: id, kind: "output_eval", verdict, reason }) });
  }

  const live = prospects.filter((p) => state[p.signal_id] !== "killed");

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">Lit<em>mus</em></div>
        <div className="meta">morning brief · {today()}</div>
      </header>
      <div className="subhead">
        {loading ? "Scoring the firehose…" : `Top ${live.length} of the day${brand ? ` · for “${brand}${brand.length >= 60 ? "…" : ""}”` : ""}`}
        {" · "}
        <Link href="/onboarding">edit context</Link>
      </div>

      {live.map((p) => {
        const st = state[p.signal_id];
        const e = p.enriched;
        return (
          <article className="entry" key={p.signal_id}>
            <div className={`score ${scoreClass(p.score)}`}>{p.score}<span className="of">/ 100</span></div>
            <div>
              <div className="who">
                {e?.full_name ?? "Unknown"} · {e?.title ?? ""}{e?.company?.name ? ` · ${e.company.name}` : ""}
              </div>
              <h2 className="reason">{p.rank_reason}</h2>

              <div className="factors">
                {p.factors.map((f) => (
                  <span className="factor" key={f.key} title={f.detail}>
                    {f.key} <b className={`pips ${f.value >= 0.75 ? "on" : ""}`}>{pips(f.value)}</b>
                  </span>
                ))}
              </div>

              <div className="contact">
                {e?.work_email && <span>✉ {e.work_email.email} {e.work_email.status === "DELIVERABLE" && <b className="verified">✓</b>}</span>}
                {e?.mobile && <span>☎ {e.mobile.number}</span>}
              </div>
              {p.warm_path && <div className="warm">warm · via {p.warm_path.via} — {p.warm_path.relationship}</div>}

              {st !== "sent" && p.drafts?.length > 0 && (
                <div className="drafts">
                  {p.drafts.map((d, i) => (
                    <div className="draft" key={i}>
                      <div className="ch">{d.channel}{d.subject ? ` — ${d.subject}` : ""}</div>
                      <div className="body">{d.body}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="actions">
                {st === "sent" ? (
                  <button className="sent" disabled>✓ sent · email + linkedin</button>
                ) : (
                  <>
                    <button className="primary" onClick={() => act(p.signal_id, "up")}>Approve & send →</button>
                    <button className="ghost" onClick={() => act(p.signal_id, "down", "rejected in brief")}>Decline</button>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}

      <div className="settings">
        <h3>Connections</h3>
        <div className="conn"><span>Sillage · intent signals</span><span className="dot ok">● connected (MCP)</span></div>
        <div className="conn"><span>FullEnrich · email + phone</span><span className="dot ok">● connected</span></div>
        <div className="conn"><span>Unipile · email + LinkedIn send</span><span className="dot ok">● connected</span></div>
        <div className="conn"><span>Output · Slack</span><span className="dot ok">● connected</span></div>
        <div className="conn"><span>Output · HubSpot</span><span className="dot">● connect</span></div>
      </div>

      <footer>LITMUS · scored by LITMUS.md · a false negative is cheaper than a burned touch</footer>
    </div>
  );
}
