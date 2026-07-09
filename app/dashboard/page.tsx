"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

type Draft = { channel: string; subject?: string; body: string };
type Factor = { key: string; value: number; detail: string };
type Prospect = {
  signal_id: string;
  score: number;
  rank_reason: string;
  why_now?: { trigger: string; what_changed: string; why_buying: string };
  factors: Factor[];
  enriched?: { full_name?: string; title?: string; company?: { name?: string }; work_email?: { email: string; status: string }; mobile?: { number: string } };
  warm_path?: { via: string; relationship: string };
  drafts: Draft[];
};

const scoreClass = (s: number) => (s >= 70 ? "hot" : s >= 40 ? "mid" : "dead");
const pips = (v: number) => "●●●●".slice(0, Math.round(v * 4)) + "○○○○".slice(0, 4 - Math.round(v * 4));
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

// Mock CRM cloud — the "huge database" the rep starts with.
const FIRST = ["Sarah", "Tomas", "Priya", "Daniel", "Lena", "Marco", "Aisha", "Ben", "Chloe", "Raj", "Nina", "Omar", "Elsa", "Yuki", "Pablo", "Ivy", "Kofi", "Mara", "Sven", "Tara"];
const LAST = ["Chen", "Rivera", "Nair", "Okoro", "Ford", "Rossi", "Khan", "Meyer", "Dubois", "Patel", "Berg", "Haddad", "Novak", "Tanaka", "Silva", "Wu", "Mensah", "Cole", "Larsen", "Reid"];
const TITLE = ["VP Sales", "Head of RevOps", "SDR", "Account Exec", "Marketing Lead", "Founder", "COO", "Sales Ops", "CS Manager", "Growth", "Director Sales", "BDR", "VP Marketing", "RevOps Analyst"];
const CO = ["Northwind", "Acme", "Vertex", "Lumen", "Cadence", "Fathom", "Orbit", "Beacon", "Cobalt", "Harbor", "Pilot", "Ridge", "Atlas", "Nova", "Delta", "Forge", "Quill", "Slate"];

function makeCloud(n: number, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, (_, i) => ({
    id: `crm_${i}`,
    name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`,
    title: `${TITLE[Math.floor(rnd() * TITLE.length)]} · ${CO[Math.floor(rnd() * CO.length)]}`,
  }));
}

const FUNNEL = [
  { n: 8432, lbl: "contacts in your CRM" },
  { n: 1204, lbl: "match your ICP" },
  { n: 312, lbl: "verified reachable" },
  { n: 5, lbl: "worth your morning" },
];

export default function Dashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [state, setState] = useState<Record<string, "sent" | "killed">>({});
  const [brand, setBrand] = useState<string>("");
  const [phase, setPhase] = useState<"cloud" | "filtering" | "brief">("cloud");
  const [count, setCount] = useState(FUNNEL[0].n);
  const [stage, setStage] = useState(0);
  const [source, setSource] = useState<"mock" | "live">("mock");

  const filler = useMemo(() => makeCloud(120), []);

  useEffect(() => {
    const c = localStorage.getItem("litmus_context");
    if (c) { try { setBrand(JSON.parse(c).what_we_sell?.slice(0, 60) ?? ""); } catch {} }
    fetch("/api/prospects").then((r) => r.json()).then((d) => setProspects(d.prospects ?? []));
  }, []);

  // the 5 winners live inside the cloud so the filter visibly selects them
  const cloud = useMemo(() => {
    const winners = prospects.slice(0, 5).map((p) => ({ id: p.signal_id, name: p.enriched?.full_name ?? "—", title: `${p.enriched?.title ?? ""} · ${p.enriched?.company?.name ?? ""}`, pick: true }));
    const rest = filler.map((c) => ({ ...c, pick: false }));
    const merged = [...rest];
    winners.forEach((w, i) => merged.splice(Math.floor((i + 1) * (merged.length / 6)), 0, w));
    return merged;
  }, [prospects, filler]);

  function runBrief() {
    setPhase("filtering");
    FUNNEL.forEach((f, i) => {
      setTimeout(() => { setStage(i); tweenTo(f.n); }, i * 620);
    });
    setTimeout(() => setPhase("brief"), FUNNEL.length * 620 + 500);
  }
  function tweenTo(target: number) {
    setCount((prev) => {
      const start = prev; const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 420);
        setCount(Math.round(start + (target - start) * k));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return prev;
    });
  }

  async function runLive() {
    const c = localStorage.getItem("litmus_context");
    if (!c) { alert("Set up your client context first (onboarding)."); return; }
    let cfg: any = {}; try { cfg = JSON.parse(localStorage.getItem("litmus_config") || "{}").cfg ?? {}; } catch {}
    setPhase("filtering"); setStage(0); setCount(FUNNEL[0].n);
    const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientContext: JSON.parse(c), topN: cfg.count ?? 5, destination: cfg.destination }) }).then((r) => r.json());
    if (res.error) { alert(`Live run: ${res.error}`); setPhase("cloud"); return; }
    setProspects(res.prospects ?? []); setSource("live"); setState({});
    FUNNEL.forEach((f, i) => setTimeout(() => { setStage(i); tweenTo(f.n); }, i * 500));
    setTimeout(() => setPhase("brief"), FUNNEL.length * 500 + 400);
  }

  async function act(p: Prospect, verdict: "up" | "down", reason?: string) {
    setState((s) => ({ ...s, [p.signal_id]: verdict === "up" ? "sent" : "killed" }));
    const key = (p.enriched?.work_email?.email || (p.enriched?.full_name && `${p.enriched.full_name}@${p.enriched?.company?.name ?? ""}`) || p.signal_id).toLowerCase();
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signal_id: p.signal_id, key, kind: "output_eval", verdict, reason }) });
  }

  const live = prospects.filter((p) => state[p.signal_id] !== "killed");

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">Lit<em>mus</em></div>
        <div className="meta">morning brief · {today()}</div>
      </header>

      {phase !== "brief" ? (
        <>
          <div className="funnel">
            <span className="n" style={{ color: stage === FUNNEL.length - 1 ? "var(--hot)" : undefined }}>{count.toLocaleString()}</span>
            <span className="lbl">{FUNNEL[stage].lbl}</span>
          </div>
          <div className="cloud-note">
            Your CRM is a firehose. Sillage + FullEnrich verify and de-noise it; Litmus scores what's left against what you sell.
          </div>
          <div className="row" style={{ marginTop: 0, marginBottom: 8 }}>
            <button className="primary" onClick={runBrief} disabled={phase === "filtering"}>
              {phase === "filtering" ? "Scoring…" : "Run today's brief →"}
            </button>
            <button className="ghost" onClick={runLive} disabled={phase === "filtering"}>Run live ↻</button>
            <Link href="/onboarding"><button className="ghost">Edit context</button></Link>
          </div>
          <div className="cloud-grid">
            {cloud.map((c, i) => (
              <div
                key={c.id}
                className={`chip ${phase === "filtering" ? (c.pick ? "pick" : "dim") : ""}`}
                style={{ transitionDelay: phase === "filtering" ? `${(i % 24) * 22}ms` : "0ms" }}
              >
                <div className="cn">{c.name}</div>
                <div className="ct">{c.title}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="subhead">
            Top {live.length} of the day{brand ? ` · for “${brand}${brand.length >= 60 ? "…" : ""}”` : ""}{source === "live" ? " · live" : ""}
            {" · "}<a onClick={() => setPhase("cloud")} style={{ cursor: "pointer" }}>← the firehose</a>
            {" · "}<Link href="/onboarding">edit context</Link>
          </div>

          {live.map((p) => {
            const st = state[p.signal_id]; const e = p.enriched;
            return (
              <article className="entry" key={p.signal_id}>
                <div className={`score ${scoreClass(p.score)}`}>{p.score}<span className="of">/ 100</span></div>
                <div>
                  <div className="who">{e?.full_name ?? "Unknown"} · {e?.title ?? ""}{e?.company?.name ? ` · ${e.company.name}` : ""}</div>
                  <h2 className="reason">{p.rank_reason}</h2>
                  {p.why_now && (
                    <div className="whynow">
                      <div><span className="wl">Trigger</span> {p.why_now.trigger}</div>
                      <div><span className="wl">Changed</span> {p.why_now.what_changed}</div>
                      <div><span className="wl">Why now</span> {p.why_now.why_buying}</div>
                    </div>
                  )}
                  <div className="factors">
                    {p.factors.map((f) => (
                      <span className="factor" key={f.key} title={f.detail}>{f.key} <b className={`pips ${f.value >= 0.75 ? "on" : ""}`}>{pips(f.value)}</b></span>
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
                        <div className="draft" key={i}><div className="ch">{d.channel}{d.subject ? ` — ${d.subject}` : ""}</div><div className="body">{d.body}</div></div>
                      ))}
                    </div>
                  )}
                  <div className="actions">
                    {st === "sent" ? (
                      <button className="sent" disabled>✓ sent · email + linkedin</button>
                    ) : (
                      <>
                        <button className="primary" onClick={() => act(p, "up")}>Approve & send →</button>
                        <button className="ghost" onClick={() => act(p, "down", "rejected in brief")}>Decline</button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </>
      )}

      <div className="settings">
        <h3>Sources — Litmus works with any of these, sharper with more</h3>
        <div className="conn"><span>HubSpot / Salesforce · your contacts</span><span className="dot">● optional (the volume)</span></div>
        <div className="conn"><span>Sillage · intent signals</span><span className="dot ok">● connected (the timing)</span></div>
        <div className="conn"><span>FullEnrich · verify + email/phone</span><span className="dot ok">● connected (the truth)</span></div>
        <div className="conn"><span>Unipile · email + LinkedIn send</span><span className="dot">● connect</span></div>
        <div className="conn"><span>Output · Slack / dashboard / your agent</span><span className="dot ok">● dashboard</span></div>
      </div>
      <footer>LITMUS · scored by LITMUS.md · a false negative is cheaper than a burned touch</footer>
    </div>
  );
}
