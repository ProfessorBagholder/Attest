import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { periodRange, statsForUser } from "@/lib/stats";
import type { Bucket } from "@/engine/metrics";
import { formatDayKey, formatDuration, formatMoney, formatNumber, formatPercent, formatRatio, pnlClass, pnlTone } from "@/lib/format";
import { parsePeriod, PeriodTabs } from "@/components/PeriodTabs";
import { MetricTable } from "@/components/MetricTable";
import { BucketChart, DailyPnlChart, EquityChart } from "@/components/charts";
import { SectionHeading, StatTile } from "@/components/ui";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; account?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const period = parsePeriod(params.period, "all");
  const range = periodRange(period, user.timeZone);
  const accounts = await prisma.account.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  const accountId = accounts.some((a) => a.id === params.account) ? params.account : undefined;
  const stats = await statsForUser(user, { from: range.from, to: range.to, accountId });
  const currency = user.baseCurrency;
  const s = stats.all;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-ink-3">
            {range.label} · closed trades only · {user.matchingMethod === "AVERAGE_COST" ? "average cost" : "FIFO"} · reported in {currency}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 ? (
            <div className="flex gap-1">
              <Link href={`/analytics?period=${period}`} className="tab" aria-current={!accountId ? "true" : undefined}>
                All accounts
              </Link>
              {accounts.map((a) => (
                <Link key={a.id} href={`/analytics?period=${period}&account=${a.id}`} className="tab" aria-current={accountId === a.id ? "true" : undefined}>
                  {a.name ?? a.institutionName} {a.currency}
                </Link>
              ))}
            </div>
          ) : null}
          <PeriodTabs current={period} basePath="/analytics" params={{ account: accountId }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Net P&L" value={formatMoney(s.netPnl, currency, { sign: true })} tone={pnlTone(s.netPnl)} sub={`${s.count} trades`} />
        <StatTile label="Win rate" value={formatPercent(s.winRate, { ratio: true })} sub={`${s.wins}W · ${s.losses}L · ${s.breakeven} flat`} />
        <StatTile label="Avg gain" value={formatMoney(s.avgPnl, currency, { sign: true })} tone={pnlTone(s.avgPnl)} sub={formatPercent(s.avgPnlPercent, { sign: true })} />
        <StatTile label="Profit factor" value={formatRatio(s.profitFactor)} sub="gross wins ÷ gross losses" />
        <StatTile label="Payoff ratio" value={formatRatio(s.payoffRatio)} sub="avg win ÷ avg loss" />
        <StatTile label="Max drawdown" value={formatMoney(-stats.drawdown.maxDrawdown, currency)} tone={stats.drawdown.maxDrawdown > 0 ? "loss" : "flat"} sub={stats.drawdown.maxDrawdownStart ? `${formatDayKey(stats.drawdown.maxDrawdownStart, "short")} → ${formatDayKey(stats.drawdown.maxDrawdownEnd ?? stats.drawdown.maxDrawdownStart, "short")}` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Accumulated profit" />
          <div className="card p-4">
            <EquityChart points={stats.equityCurve} currency={currency} />
          </div>
        </section>
        <section>
          <SectionHeading title="Daily P&L" description={`${stats.tradingDays} trading days · ${stats.winningDays} green · ${stats.losingDays} red`} />
          <div className="card p-4">
            <DailyPnlChart daily={stats.daily} currency={currency} height={220} />
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Gain / loss" />
          <MetricTable
            rows={[
              { label: "Net P&L", all: formatMoney(s.netPnl, currency, { sign: true }), wins: formatMoney(sum(s.avgWin, s.wins), currency, { sign: true }), losses: formatMoney(sum(s.avgLoss, s.losses), currency, { sign: true }) },
              { label: "Gross P&L", all: formatMoney(s.grossPnl, currency, { sign: true }), hint: "before fees" },
              { label: "Fees", all: formatMoney(s.fees, currency) },
              { label: "Trades", all: String(s.count), wins: `${s.wins} (${formatPercent(s.winRate, { ratio: true, decimals: 0 })})`, losses: `${s.losses} (${formatPercent(s.count ? s.losses / s.count : null, { ratio: true, decimals: 0 })})` },
              { label: "Average gain", all: formatMoney(s.avgPnl, currency, { sign: true }), wins: formatMoney(s.avgWin, currency, { sign: true }), losses: formatMoney(s.avgLoss, currency, { sign: true }) },
              { label: "Average gain %", all: formatPercent(s.avgPnlPercent, { sign: true }), hint: "mean of per-trade gain ÷ cost basis" },
              { label: "Largest", all: "", wins: formatMoney(s.largestWin, currency, { sign: true }), losses: formatMoney(s.largestLoss, currency, { sign: true }) },
              { label: "Expectancy", all: formatMoney(stats.expectancy, currency, { sign: true }), hint: "expected net per trade" },
              { label: "Consecutive", all: `now ${stats.streaks.currentStreak > 0 ? `${stats.streaks.currentStreak}W` : stats.streaks.currentStreak < 0 ? `${-stats.streaks.currentStreak}L` : "—"}`, wins: `${stats.streaks.maxConsecutiveWins} max`, losses: `${stats.streaks.maxConsecutiveLosses} max` },
              { label: "Volume traded", all: formatMoney(s.volume, currency, { decimals: 0 }), hint: "bought + sold notional" },
            ]}
          />
        </section>
        <section>
          <SectionHeading title="Long / short" />
          <MetricTable
            columns={["All", "Long", "Short"]}
            rows={[
              { label: "Trades", all: String(s.count), wins: String(stats.long.count), losses: String(stats.short.count) },
              { label: "Net P&L", all: formatMoney(s.netPnl, currency, { sign: true }), wins: formatMoney(stats.long.netPnl, currency, { sign: true }), losses: formatMoney(stats.short.netPnl, currency, { sign: true }) },
              { label: "Win rate", all: formatPercent(s.winRate, { ratio: true }), wins: formatPercent(stats.long.winRate, { ratio: true }), losses: formatPercent(stats.short.winRate, { ratio: true }) },
              { label: "Average gain", all: formatMoney(s.avgPnl, currency, { sign: true }), wins: formatMoney(stats.long.avgPnl, currency, { sign: true }), losses: formatMoney(stats.short.avgPnl, currency, { sign: true }) },
              { label: "Average gain %", all: formatPercent(s.avgPnlPercent, { sign: true }), wins: formatPercent(stats.long.avgPnlPercent, { sign: true }), losses: formatPercent(stats.short.avgPnlPercent, { sign: true }) },
              { label: "Profit factor", all: formatRatio(s.profitFactor), wins: formatRatio(stats.long.profitFactor), losses: formatRatio(stats.short.profitFactor) },
              { label: "Average hold", all: formatDuration(s.avgHoldingSeconds), wins: formatDuration(stats.long.avgHoldingSeconds), losses: formatDuration(stats.short.avgHoldingSeconds) },
            ]}
          />
          <div className="mt-6" />
          <SectionHeading title="Timing" description="Where the edge shows up — and where it leaks." />
          <MetricTable
            rows={[
              { label: "Average hold", all: formatDuration(s.avgHoldingSeconds), wins: formatDuration(stats.avgHoldingWins), losses: formatDuration(stats.avgHoldingLosses) },
              { label: "Green days", all: `${stats.winningDays} of ${stats.tradingDays}` },
              { label: "Best day", all: bestDay(stats.daily, currency, "best") },
              { label: "Worst day", all: bestDay(stats.daily, currency, "worst") },
              { label: "Trades per day", all: formatNumber(stats.tradingDays ? s.count / stats.tradingDays : null, 1) },
            ]}
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section>
          <SectionHeading title="By holding period" />
          <div className="card p-4">
            <BucketChart buckets={stats.byHoldingPeriod} currency={currency} height={180} />
          </div>
          <BucketTable buckets={stats.byHoldingPeriod} currency={currency} />
        </section>
        <section>
          <SectionHeading title="By weekday" />
          <div className="card p-4">
            <BucketChart buckets={stats.byWeekday.map((b) => ({ ...b, label: b.label.slice(0, 3) }))} currency={currency} height={180} />
          </div>
          <BucketTable buckets={stats.byWeekday} currency={currency} />
        </section>
        <section>
          <SectionHeading title="By entry hour" description={stats.byHour.length ? `${user.timeZone}` : "Your broker reports trades by day, so entry times are unavailable."} />
          <div className="card p-4">
            <BucketChart buckets={stats.byHour} currency={currency} height={180} />
          </div>
          <BucketTable buckets={stats.byHour} currency={currency} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Symbols by trades" description="Top 10 most-traded" />
          <SymbolTable buckets={stats.bySymbolTrades} currency={currency} />
        </section>
        <section>
          <SectionHeading title="Symbols by volume" description="Top 10 by notional bought + sold" />
          <SymbolTable buckets={stats.bySymbolVolume} currency={currency} volume />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Best trades" />
          <BestWorst trades={stats.bestTrades} currency={currency} />
        </section>
        <section>
          <SectionHeading title="Worst trades" />
          <BestWorst trades={stats.worstTrades} currency={currency} />
        </section>
      </div>

      {stats.byMonth.length > 1 ? (
        <section>
          <SectionHeading title="By month" />
          <div className="card p-4">
            <BucketChart buckets={stats.byMonth.map((b) => ({ ...b, label: formatDayKey(`${b.key}-01`, "short").replace(/ 1$/, "") }))} currency={currency} height={200} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function sum(avg: number | null, count: number): number | null {
  return avg === null ? null : avg * count;
}

function bestDay(daily: { dayKey: string; netPnl: number }[], currency: string, mode: "best" | "worst"): string {
  if (daily.length === 0) return "—";
  const sorted = [...daily].sort((a, b) => (mode === "best" ? b.netPnl - a.netPnl : a.netPnl - b.netPnl));
  const day = sorted[0];
  if (mode === "worst" && day.netPnl >= 0) return "—";
  return `${formatMoney(day.netPnl, currency, { sign: true })} · ${formatDayKey(day.dayKey, "short")}`;
}

function BucketTable({ buckets, currency }: { buckets: Bucket[]; currency: string }) {
  if (buckets.length === 0) return null;
  return (
    <div className="card mt-2 overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th> </th>
            <th className="text-right">Trades</th>
            <th className="text-right">Win %</th>
            <th className="text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key} className="[&>td]:py-1.5">
              <td className="text-ink-2">{b.label}</td>
              <td className="num text-right">{b.count}</td>
              <td className="num text-right">{formatPercent(b.winRate, { ratio: true, decimals: 0 })}</td>
              <td className={`num text-right font-medium ${pnlClass(b.netPnl)}`}>{formatMoney(b.netPnl, currency, { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SymbolTable({ buckets, currency, volume = false }: { buckets: Bucket[]; currency: string; volume?: boolean }) {
  if (buckets.length === 0) return <p className="text-sm text-ink-3">No closed trades in this period.</p>;
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th className="text-right">{volume ? "Volume" : "Trades"}</th>
            <th className="text-right">Wins</th>
            <th className="text-right">Losses</th>
            <th className="text-right">Net P&amp;L</th>
            <th className="text-right">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <td>
                <Link href={`/trades?symbol=${encodeURIComponent(b.key)}`} className="font-medium hover:underline">
                  {b.label}
                </Link>
              </td>
              <td className="num text-right">{volume ? formatMoney(b.volume, currency, { decimals: 0 }) : b.count}</td>
              <td className="num text-right text-gain">{b.wins}</td>
              <td className="num text-right text-loss">{b.losses}</td>
              <td className={`num text-right font-medium ${pnlClass(b.netPnl)}`}>{formatMoney(b.netPnl, currency, { sign: true })}</td>
              <td className={`num text-right ${pnlClass(b.avgPnlPercent)}`}>{formatPercent(b.avgPnlPercent, { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BestWorst({ trades, currency }: { trades: Array<{ tradeKey: string; symbol: string; direction: string; netPnlBase: number; pnlPercent: number | null; closedAt: Date | null; openedAt: Date; hasTime: boolean; holdingSeconds: number | null }>; currency: string }) {
  if (trades.length === 0) return <p className="text-sm text-ink-3">Nothing here yet.</p>;
  return (
    <div className="card divide-y divide-line">
      {trades.map((t) => (
        <TradeRowLink key={t.tradeKey} tradeKey={t.tradeKey} symbol={t.symbol} direction={t.direction} netPnl={t.netPnlBase} pnlPercent={t.pnlPercent} held={t.holdingSeconds} currency={currency} />
      ))}
    </div>
  );
}

async function TradeRowLink({ tradeKey, symbol, direction, netPnl, pnlPercent, held, currency }: { tradeKey: string; symbol: string; direction: string; netPnl: number; pnlPercent: number | null; held: number | null; currency: string }) {
  const row = await prisma.trade.findUnique({ where: { tradeKey }, select: { id: true, closeDayKey: true } });
  const body = (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span>
        <span className="font-medium">{symbol}</span>
        <span className="ml-2 text-xs text-ink-3">
          {direction === "LONG" ? "Long" : "Short"} · {formatDuration(held)}
          {row?.closeDayKey ? ` · ${formatDayKey(row.closeDayKey, "short")}` : ""}
        </span>
      </span>
      <span className="text-right">
        <span className={`num font-medium ${pnlClass(netPnl)}`}>{formatMoney(netPnl, currency, { sign: true })}</span>
        <span className={`num ml-2 text-xs ${pnlClass(pnlPercent)}`}>{formatPercent(pnlPercent, { sign: true })}</span>
      </span>
    </div>
  );
  return row ? (
    <Link href={`/trades/${row.id}`} className="block hover:bg-paper-2">
      {body}
    </Link>
  ) : (
    body
  );
}

