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
        <span className="drop">S</span>illage shows you a lot of sales opportunities. That is helpful,
        but it is also a lot to handle. Every morning a rep faces a flood of opportunities with no
        clear way to pick which accounts to work, why, or how to reach them. Litmus reads them all,
        matches them to what you sell, picks the ten that matter most, and writes the outreach. You
        approve. It sends.
      </p>

      <div className="row">
        <Link href="/onboarding">
          <button className="primary">Set up your preferences →</button>
        </Link>
      </div>

      <footer>
        LITMUS · Station F Agentic GTM · Sillage × FullEnrich × Anthropic · Unipile
      </footer>
    </div>
  );
}
