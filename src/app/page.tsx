import Link from "next/link";
import { currentUser } from "@/lib/auth-next";
import { PublicNav } from "@/components/Nav";
import { Stars, VerifiedBadge } from "@/components/ui";

export default async function LandingPage() {
  const user = await currentUser();
  return (
    <div className="min-h-screen">
      <PublicNav user={user} />
      <main className="mx-auto max-w-6xl px-4">
        <section className="grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <VerifiedBadge size="lg" label="Verified through your broker" />
            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">Verified trading performance.</h1>
            <p className="mt-4 max-w-md text-lg text-ink-2">
              Attest tracks your trading performance straight from Wealthsimple. Trades cannot be added, edited or deleted, so your journal, your statistics and your public profile are a record that anyone can trust — including you.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={user ? "/dashboard" : "/signup"} className="btn-primary">
                {user ? "Open your journal" : "Get started — it's free"}
              </Link>
              <Link href="/leaderboard" className="btn-secondary">
                See the leaderboard
              </Link>
            </div>
            <p className="mt-3 text-xs text-ink-3">Read-only connection via SnapTrade. Your Wealthsimple credentials never touch our servers.</p>
          </div>
          <MockPortfolio />
        </section>

        <section className="grid gap-6 border-t border-line py-16 md:grid-cols-3">
          <Feature title="Trading journal" body="A monthly calendar of every closed trade, imported automatically each day. Add notes, ratings and tags to the numbers your broker reported; you can never change the numbers themselves." />
          <Feature title="Trader verification" body="Turn on sharing and your profile shows a broker-verified badge, verification stars for profitable 30, 90 and 365-day periods, and a track record no screenshot can fake." />
          <Feature title="Analytics" body="Win rate, average gain in dollars and percent, profit factor, expectancy, drawdown, long vs short, holding periods, time of day and your most traded symbols — computed the same way for everyone." />
        </section>

        <section className="border-t border-line py-16">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            <Step n={1} title="Sign up" body="Under a minute. No real name required — pick a username." />
            <Step n={2} title="Link Wealthsimple" body="Approve read-only access in SnapTrade's connection portal. Your full history imports." />
            <Step n={3} title="Track, learn, prove" body="Your journal fills itself in daily. Share your profile when you're ready." />
          </ol>
        </section>
      </main>
      <footer className="border-t border-line py-8 text-center text-xs text-ink-3">Attest is a journal and verification tool, not investment advice. Performance is computed from closed trades as reported by your brokerage.</footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-ink-2">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-paper">{n}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-ink-2">{body}</span>
      </span>
    </li>
  );
}

function MockPortfolio() {
  const days = [null, null, 420, -180, 610, 95, null, null, -240, 330, 0, 505, 210, null, null, 150, -90, 720, 260, 180, null, null, -310, 440, 130, 560, 90, null];
  return (
    <div className="card mx-auto w-full max-w-sm p-5 shadow-sm" aria-hidden>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">@maplealpha</div>
          <div className="mt-1 flex items-center gap-2">
            <VerifiedBadge size="sm" />
            <Stars count={3} size="sm" />
          </div>
        </div>
        <div className="text-right">
          <div className="label">Verified profit</div>
          <div className="num text-xl font-semibold text-gain">+$18,420</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini label="Win rate" value="61%" />
        <Mini label="Avg gain" value="+1.8%" />
        <Mini label="Trades" value="284" />
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1">
        {days.map((v, i) => (
          <div key={i} className={`num h-9 rounded-md text-[10px] leading-9 text-center ${v === null ? "bg-paper-2" : v > 0 ? "bg-gain-soft text-gain" : v < 0 ? "bg-loss-soft text-loss" : "bg-paper-2 text-ink-3"}`}>
            {v === null ? "" : v > 0 ? `+${v}` : v}
          </div>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper-2 p-2">
      <div className="label">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
