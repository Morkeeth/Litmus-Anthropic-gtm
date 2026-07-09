"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LAYERS = [
  { title: "WHO — who you sell to", note: "Auto-fill from Sillage, then refine. The tools already know this.", who: true, fields: [
    { key: "icp", label: "ICP", hint: "Company profile, personas you win with, and who is NOT a fit.", area: true },
  ]},
  { title: "WHAT — what you sell", note: "Seller-only. No data tool has this.", fields: [
    { key: "what_we_sell", label: "Product & value", hint: "The product, the value, the problem it kills.", area: true },
    { key: "competitors", label: "Competitors", hint: "Who you displace or lose to.", area: false },
    { key: "proof_assets", label: "Proof to cite", hint: "Case studies, integrations, logos.", area: false },
  ]},
  { title: "HOW — how you reach out", note: "Feeds the drafts.", fields: [
    { key: "tone_of_voice", label: "Tone of voice", hint: "How you open. What you never do.", area: true },
    { key: "example_that_worked", label: "A message that got a reply", hint: "Your best tone anchor.", area: true },
  ]},
  { title: "WHY-GOOD — what makes a prospect hot for you", note: "The judgment no data tool has. This is what sharpens your scoring.", fields: [
    { key: "why_good", label: "Your 2-3 rules", hint: "e.g. 'recent VP Sales change', 'already using a competitor', 'hiring SDRs fast'.", area: true },
  ]},
];

const SOURCES = [
  { key: "fullenrich", name: "FullEnrich", role: "verify + email/phone", modes: ["API key"] },
  { key: "sillage", name: "Sillage", role: "intent signals", modes: ["API key", "MCP login"] },
  { key: "hubspot", name: "HubSpot / Salesforce", role: "your contacts (the volume)", modes: ["API key", "MCP login"] },
];

const DESTINATIONS = ["Dashboard", "Slack", "HubSpot", "Your agent"];
const CADENCE = ["Once a day", "Twice a day", "Every 4 hours", "Hourly"];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const [conns, setConns] = useState<Record<string, { mode: string; connected: boolean }>>({});
  const [cfg, setCfg] = useState({ destination: "Dashboard", cadence: "Once a day", count: 5 });
  const [pulled, setPulled] = useState(false);

  async function pullPersona() {
    const r = await fetch("/api/persona").then((x) => x.json()).catch(() => null);
    if (r?.icp) { setCtx({ ...ctx, icp: r.icp }); setPulled(true); }
    else alert(r?.error || "No Sillage persona found — connect Sillage first.");
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("litmus_context"); if (c) setCtx(JSON.parse(c));
      const g = localStorage.getItem("litmus_config"); if (g) { const p = JSON.parse(g); setConns(p.conns ?? {}); setCfg(p.cfg ?? cfg); }
    } catch {}
  }, []);

  function finish() {
    localStorage.setItem("litmus_context", JSON.stringify(ctx));
    localStorage.setItem("litmus_config", JSON.stringify({ conns, cfg }));
    router.push("/dashboard");
  }

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">Lit<em>mus</em></div>
        <div className="meta">setup · {step} / 3</div>
      </header>

      <div className="stepper">
        {["Context", "Connect", "Output"].map((s, i) => (
          <span key={s} className={`step ${step === i + 1 ? "active" : step > i + 1 ? "done" : ""}`} onClick={() => setStep(i + 1)}>
            {i + 1} {s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <>
          <p className="lede"><span className="drop">A</span> prospect is only good relative to what you sell. Set this once — every score and every draft is measured against it.</p>
          {LAYERS.map((L) => (
            <div className="layer" key={L.title}>
              <div className="layer-h">{L.title}<span className="layer-note">{L.note}</span></div>
              {L.who && (
                <button className="ghost" onClick={pullPersona} style={{ marginBottom: 10 }}>
                  {pulled ? "✓ pulled from Sillage — edit below" : "Pull my persona from Sillage ↓"}
                </button>
              )}
              {L.fields.map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <div className="hint">{f.hint}</div>
                  {f.area
                    ? <textarea rows={3} value={ctx[f.key] ?? ""} onChange={(e) => setCtx({ ...ctx, [f.key]: e.target.value })} />
                    : <input value={ctx[f.key] ?? ""} onChange={(e) => setCtx({ ...ctx, [f.key]: e.target.value })} />}
                </div>
              ))}
            </div>
          ))}
          <div className="row"><button className="primary" onClick={() => setStep(2)}>Next: connect your data →</button></div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="lede" style={{ fontSize: 17 }}>Connect the tools you already use. Bring your own key, or log in via MCP. No FullEnrich or Sillage? Skip — Litmus still scores your CRM/CSV contacts.</p>
          {SOURCES.map((s) => {
            const c = conns[s.key];
            return (
              <div className="source" key={s.key}>
                <div className="source-head">
                  <div><b>{s.name}</b> <span className="src-role">{s.role}</span></div>
                  <span className={`dot ${c?.connected ? "ok" : ""}`}>{c?.connected ? "● connected" : "○ not connected"}</span>
                </div>
                <div className="source-modes">
                  {s.modes.map((m) => (
                    <button key={m} className={c?.mode === m ? "primary" : "ghost"} onClick={() => setConns({ ...conns, [s.key]: { mode: m, connected: false } })}>{m}</button>
                  ))}
                </div>
                {c?.mode === "API key" && (
                  <input placeholder={`${s.name} API key`} onChange={(e) => setConns({ ...conns, [s.key]: { mode: "API key", connected: e.target.value.length > 8 } })} />
                )}
                {c?.mode === "MCP login" && (
                  <button className="ghost" onClick={() => setConns({ ...conns, [s.key]: { mode: "MCP login", connected: true } })}>{c.connected ? "✓ logged in" : `Log in to ${s.name} via MCP →`}</button>
                )}
              </div>
            );
          })}
          <div className="row"><button className="ghost" onClick={() => setStep(1)}>← Back</button><button className="primary" onClick={() => setStep(3)}>Next: choose your output →</button></div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="lede" style={{ fontSize: 17 }}>Where should the brief land, how often, and how many prospects? Litmus delivers a ranked, drafted list — you approve and send.</p>

          <div className="field">
            <label>Deliver to</label>
            <div className="hint">The scored list is sent wherever you work.</div>
            <div className="choices">{DESTINATIONS.map((d) => <button key={d} className={cfg.destination === d ? "primary" : "ghost"} onClick={() => setCfg({ ...cfg, destination: d })}>{d}</button>)}</div>
          </div>

          <div className="field">
            <label>How often</label>
            <div className="hint">Litmus re-scores the firehose on this cadence.</div>
            <div className="choices">{CADENCE.map((d) => <button key={d} className={cfg.cadence === d ? "primary" : "ghost"} onClick={() => setCfg({ ...cfg, cadence: d })}>{d}</button>)}</div>
          </div>

          <div className="field">
            <label>Prospects per brief</label>
            <div className="hint">The overloaded rep wants a short list. Default 5.</div>
            <div className="choices">{[3, 5, 7, 10].map((n) => <button key={n} className={cfg.count === n ? "primary" : "ghost"} onClick={() => setCfg({ ...cfg, count: n })}>{n}</button>)}</div>
          </div>

          <div className="row"><button className="ghost" onClick={() => setStep(2)}>← Back</button><button className="primary" onClick={finish}>Open my brief →</button></div>
        </>
      )}

      <footer>Anthropic runs the scoring — that's on us, no AI key needed. You only connect your own data. <Link href="/dashboard">skip setup</Link></footer>
    </div>
  );
}
