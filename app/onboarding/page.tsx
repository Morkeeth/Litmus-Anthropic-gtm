"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const FIELDS = [
  { key: "what_we_sell", label: "What we sell", hint: "One paragraph: the product, the value, the problem it kills.", area: true },
  { key: "icp", label: "Who we sell to (ICP)", hint: "Company profile, the personas you win with, and who is NOT a fit.", area: true },
  { key: "competitors", label: "Competitors", hint: "Who you displace or lose to. Used to read competitive signals.", area: false },
  { key: "proof_assets", label: "Proof to reference", hint: "Case studies, integrations, logos the rep can cite.", area: false },
  { key: "tone_of_voice", label: "Tone of voice & approach", hint: "Direct? technical? warm? How you open. What you never do.", area: true },
  { key: "example_that_worked", label: "A message that got a reply", hint: "Paste one real outreach that worked — the best tone anchor.", area: true },
];

export default function Onboarding() {
  const router = useRouter();
  const [ctx, setCtx] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem("litmus_context");
    if (saved) setCtx(JSON.parse(saved));
  }, []);

  function save() {
    localStorage.setItem("litmus_context", JSON.stringify(ctx));
    router.push("/dashboard");
  }

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">Lit<em>mus</em></div>
        <div className="meta">onboarding · set up once</div>
      </header>
      <div className="subhead">Client context — this grounds every score and every draft</div>

      <p className="lede" style={{ fontSize: 18, margin: "26px 0 30px" }}>
        A prospect is only &ldquo;good&rdquo; relative to what <em>you</em> sell. Tell Litmus once, and
        every signal it scores and every message it writes is measured against this.
      </p>

      {FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label>{f.label}</label>
          <div className="hint">{f.hint}</div>
          {f.area ? (
            <textarea rows={3} value={ctx[f.key] ?? ""} onChange={(e) => setCtx({ ...ctx, [f.key]: e.target.value })} />
          ) : (
            <input value={ctx[f.key] ?? ""} onChange={(e) => setCtx({ ...ctx, [f.key]: e.target.value })} />
          )}
        </div>
      ))}

      <div className="row">
        <button className="primary" onClick={save}>Save & open today&rsquo;s brief →</button>
        <Link href="/dashboard"><button className="ghost">Skip</button></Link>
      </div>
      <footer>Stored locally in this browser for the demo. Injected into LITMUS.md as CLIENT_CONTEXT.</footer>
    </div>
  );
}
