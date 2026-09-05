import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { ratingForUser, statsForUser } from "@/lib/stats";
import { buildCalendarMonth } from "@/engine/calendar";
import { todayKey } from "@/engine/time";
import { formatDuration, formatMoney, formatNumber, formatPercent, formatRatio, pnlTone, relativeTime } from "@/lib/format";
import { EquityChart } from "@/components/charts";
import { Calendar } from "@/components/Calendar";
import { TradeTable } from "@/components/TradeTable";
import { Empty, SectionHeading, Stars, StatTile, VerifiedBadge } from "@/components/ui";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, rating, recent, connections, lastRun] = await Promise.all([
    statsForUser(user),
    ratingForUser(user),
    prisma.trade.findMany({ where: { userId: user.id, matchingMethod: user.matchingMethod, status: "CLOSED" }, orderBy: { closedAt: "desc" }, take: 8 }),
    prisma.brokerConnection.findMany({ where: { userId: user.id, status: { not: "REMOVED" } }, include: { accounts: true } }),
    prisma.syncRun.findFirst({ where: { userId: user.id }, orderBy: { startedAt: "desc" } }),
  ]);

  const today = todayKey(user.timeZone);
  const [year, month] = today.split("-").map(Number);
  const calendar = buildCalendarMonth(stats.daily, year, month);
  const verified = connections.length > 0;
  const currency = user.baseCurrency;

  if (!verified) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <Empty title="Connect Wealthsimple to start your verified journal">
          <p className="mx-auto max-w-md">Trades import straight from your broker through SnapTrade with a read-only connection. Nothing is typed in by hand, so nothing can be cherry-picked.</p>
          <Link href="/accounts" className="btn-primary mt-4">
            Connect a broker
          </Link>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <VerifiedBadge />
            <Stars count={rating.stars} />
            <span>
              {connections.map((c) => c.brokerageName).join(", ")} · {connections.reduce((s, c) => s + c.accounts.length, 0)} account(s) · synced {relativeTime(lastRun?.finishedAt ?? lastRun?.startedAt ?? null)}
            </span>
          </div>
        </div>
        <Link href={`/u/${user.username}`} className="btn-secondary text-xs">
          View public profile
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Verified profit" value={formatMoney(stats.all.netPnl, currency, { sign: true })} tone={pnlTone(stats.all.netPnl)} sub={`${stats.all.count} closed trades · all time`} />
        <StatTile label="Win rate" value={formatPercent(stats.all.winRate, { ratio: true })} sub={`${stats.all.wins}W · ${stats.all.losses}L${stats.all.breakeven ? ` · ${stats.all.breakeven} flat` : ""}`} />
        <StatTile label="Avg gain" value={formatMoney(stats.all.avgPnl, currency, { sign: true })} tone={pnlTone(stats.all.avgPnl)} sub="per closed trade" />
        <StatTile label="Avg gain %" value={formatPercent(stats.all.avgPnlPercent, { sign: true })} tone={pnlTone(stats.all.avgPnlPercent)} sub="relative to cost basis" />
      </div>

      <section>
        <SectionHeading title="Accumulated profit" description="Realized P&L by closing date, in your reporting currency." />
        <div className="card p-4">
          <EquityChart points={stats.equityCurve} currency={currency} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionHeading
            title="This month"
            description={`${calendar.count} trades · ${calendar.winningDays} green days · ${calendar.losingDays} red days`}
            action={
              <Link href={`/journal?month=${today.slice(0, 7)}`} className="btn-ghost text-xs">
                Open journal →
              </Link>
            }
          />
          <div className="card p-3">
            <Calendar month={calendar} currency={currency} hrefForDay={(d) => `/journal?month=${d.slice(0, 7)}&day=${d}`} compact />
          </div>
        </section>
        <section>
          <SectionHeading title="Edge at a glance" />
          <div className="card divide-y divide-line">
            <Row label="Profit factor" value={formatRatio(stats.all.profitFactor)} />
            <Row label="Expectancy" value={formatMoney(stats.expectancy, currency, { sign: true })} />
            <Row label="Payoff ratio" value={formatRatio(stats.all.payoffRatio)} hint="avg win ÷ avg loss" />
            <Row label="Max drawdown" value={formatMoney(-stats.drawdown.maxDrawdown, currency)} />
            <Row label="Avg hold (wins / losses)" value={`${formatDuration(stats.avgHoldingWins)} / ${formatDuration(stats.avgHoldingLosses)}`} />
            <Row label="Longest streak" value={`${stats.streaks.maxConsecutiveWins}W / ${stats.streaks.maxConsecutiveLosses}L`} />
            <Row label="Trading days" value={`${stats.tradingDays} (${formatNumber(stats.tradingDays ? (stats.winningDays / stats.tradingDays) * 100 : 0, 0)}% green)`} />
          </div>
          <Link href="/analytics" className="btn-ghost mt-2 text-xs">
            Full analytics →
          </Link>
        </section>
      </div>

      <section>
        <SectionHeading
          title="Latest trades"
          action={
            <Link href="/trades" className="btn-ghost text-xs">
              All trades →
            </Link>
          }
        />
        <TradeTable trades={recent} timeZone={user.timeZone} baseCurrency={currency} />
      </section>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-ink-2">
        {label}
        {hint ? <span className="ml-1 text-xs text-ink-3">({hint})</span> : null}
      </span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}
