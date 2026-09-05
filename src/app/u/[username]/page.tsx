import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth-next";
import { ratingForUser, statsForUser, tradeWhere } from "@/lib/stats";
import { buildCalendarMonth } from "@/engine/calendar";
import { todayKey } from "@/engine/time";
import { formatDayKey, formatDuration, formatMoney, formatPercent, formatRatio, pnlTone } from "@/lib/format";
import { PublicNav } from "@/components/Nav";
import { Calendar } from "@/components/Calendar";
import { EquityChart } from "@/components/charts";
import { TradeTable } from "@/components/TradeTable";
import { Empty, SectionHeading, Stars, StatTile, VerifiedBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ username }, query, viewer] = await Promise.all([params, searchParams, currentUser()]);
  const profile = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, include: { connections: { where: { status: { not: "REMOVED" } }, orderBy: { createdAt: "asc" } } } });
  if (!profile) notFound();
  const isOwner = viewer?.id === profile.id;
  if (!profile.isPublic && !isOwner) {
    return (
      <div className="min-h-screen">
        <PublicNav user={viewer} />
        <main className="mx-auto max-w-3xl px-4 py-16">
          <Empty title={`@${profile.username} keeps their journal private`}>Traders choose whether to share their verified record.</Empty>
        </main>
      </div>
    );
  }

  const today = todayKey(profile.timeZone);
  const monthKey = /^\d{4}-\d{2}$/.test(query.month ?? "") ? (query.month as string) : today.slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);
  const [stats, rating, recent] = await Promise.all([
    statsForUser(profile),
    ratingForUser(profile),
    prisma.trade.findMany({ where: { ...tradeWhere(profile), ...(profile.hideOpenTrades ? { status: "CLOSED" } : {}) }, orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }], take: 10 }),
  ]);
  const calendar = buildCalendarMonth(stats.daily, year, month);
  const hideDollars = !profile.showDollars && !isOwner;
  const currency = profile.baseCurrency;
  const verified = profile.connections.length > 0;
  const since = profile.connections[0]?.createdAt ?? null;

  return (
    <div className="min-h-screen">
      <PublicNav user={viewer} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{profile.displayName}</h1>
            <div className="mt-1 text-sm text-ink-3">@{profile.username}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {verified ? <VerifiedBadge /> : <span className="pill">Not yet verified</span>}
              <Stars count={rating.stars} />
              {since ? <span className="text-xs text-ink-3">Verified since {since.toLocaleDateString("en-CA", { month: "long", year: "numeric" })} · {profile.connections.map((c) => c.brokerageName).join(", ")}</span> : null}
            </div>
            {profile.bio ? <p className="mt-3 max-w-xl text-sm text-ink-2">{profile.bio}</p> : null}
          </div>
          {isOwner ? (
            <Link href="/settings#sharing" className="btn-secondary text-xs">
              {profile.isPublic ? "Sharing is on · edit" : "Private · turn on sharing"}
            </Link>
          ) : null}
        </header>

        {!profile.isPublic && isOwner ? <p className="rounded-xl bg-paper-2 px-4 py-3 text-sm text-ink-2">Only you can see this page right now. Turn on sharing in settings to publish it.</p> : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Verified profit" value={hideDollars ? "hidden" : formatMoney(stats.all.netPnl, currency, { sign: true })} tone={hideDollars ? "flat" : pnlTone(stats.all.netPnl)} sub={`${stats.all.count} closed trades`} />
          <StatTile label="Win rate" value={formatPercent(stats.all.winRate, { ratio: true })} sub={`${stats.all.wins}W · ${stats.all.losses}L`} />
          <StatTile label="Avg gain %" value={formatPercent(stats.all.avgPnlPercent, { sign: true })} tone={pnlTone(stats.all.avgPnlPercent)} sub={hideDollars ? "per closed trade" : `${formatMoney(stats.all.avgPnl, currency, { sign: true })} per trade`} />
          <StatTile label="Profit factor" value={formatRatio(stats.all.profitFactor)} sub={`avg hold ${formatDuration(stats.all.avgHoldingSeconds)}`} />
        </div>

        <section>
          <SectionHeading title="Verification stars" description="One star per profitable trailing window, in order: 30 days, then 90, then 365." />
          <div className="grid gap-3 md:grid-cols-3">
            {rating.windows.map((w) => (
              <div key={w.days} className={`card p-4 ${w.earned ? "" : "opacity-70"}`}>
                <div className="flex items-center justify-between">
                  <span className="label">Last {w.days} days</span>
                  <Stars count={w.earned ? 1 : 0} size="sm" />
                </div>
                <div className={`num mt-2 text-lg font-semibold ${hideDollars ? "" : pnlTone(w.netPnl) === "gain" ? "text-gain" : pnlTone(w.netPnl) === "loss" ? "text-loss" : ""}`}>{hideDollars ? (w.profitable ? "Profitable" : "Not profitable") : formatMoney(w.netPnl, currency, { sign: true })}</div>
                <div className="text-xs text-ink-3">
                  {w.trades} closed trade{w.trades === 1 ? "" : "s"}
                  {w.trades < rating.minTrades ? ` · needs ${rating.minTrades}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading title="Accumulated profit" />
          <div className="card p-4">
            <EquityChart points={stats.equityCurve} currency={currency} hideDollars={hideDollars} />
          </div>
        </section>

        <section>
          <SectionHeading
            title={formatDayKey(`${monthKey}-01`, "monthYear")}
            description={`${calendar.count} closed trades · ${calendar.winningDays} green days · ${calendar.losingDays} red days`}
            action={
              <span className="flex gap-1">
                <Link href={`/u/${profile.username}?month=${shift(monthKey, -1)}`} className="btn-secondary px-3" aria-label="Previous month">
                  ←
                </Link>
                <Link href={`/u/${profile.username}?month=${shift(monthKey, 1)}`} className="btn-secondary px-3" aria-label="Next month">
                  →
                </Link>
              </span>
            }
          />
          <div className="card p-3">
            <Calendar month={calendar} currency={currency} hideDollars={hideDollars} />
          </div>
        </section>

        <section>
          <SectionHeading title="Latest trades" description={profile.hideOpenTrades ? "Open positions are hidden until they close." : undefined} />
          <TradeTable trades={recent} timeZone={profile.timeZone} baseCurrency={currency} hideDollars={hideDollars} linkTo={isOwner ? undefined : null} />
        </section>
      </main>
    </div>
  );
}

function shift(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
