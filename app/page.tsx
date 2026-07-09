import Link from "next/link";

export default function Home() {
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">
          Lit<em>mus</em>
        </div>
        <div className="meta">the scoring layer for intent</div>
      </header>

      <p className="lede">
        <span className="drop">S</span>illage surfaces a lot of intent. That is the point, and the
        problem. Every morning a rep opens a firehose of signals with no principled way to decide
        which five accounts to work, why, or how to reach them. Litmus scores the firehose against
        what you actually sell, ranks the ten that matter, and drafts the outreach. You approve. It
        sends.
      </p>

      <div className="row">
        <Link href="/onboarding">
          <button className="primary">Set up your brief →</button>
        </Link>
        <Link href="/dashboard">
          <button className="ghost">Skip to today&rsquo;s brief</button>
        </Link>
      </div>

      <footer>
        LITMUS · Station F Agentic GTM · Sillage × FullEnrich × Anthropic · Unipile
      </footer>
    </div>
  );
}
