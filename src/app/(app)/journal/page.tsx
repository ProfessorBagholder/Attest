import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { loadClosedTrades, tradeWhere } from "@/lib/stats";
import { computeStats } from "@/engine/metrics";
import { buildCalendarMonth } from "@/engine/calendar";
import { todayKey } from "@/engine/time";
import { formatDayKey, formatDuration, formatMoney, formatPercent, formatRatio, pnlTone } from "@/lib/format";
import { Calendar } from "@/components/Calendar";
import { MetricTable } from "@/components/MetricTable";
import { TradeTable } from "@/components/TradeTable";
import { DailyPnlChart } from "@/components/charts";
import { Empty, SectionHeading, StatTile } from "@/components/ui";

export const metadata = { title: "Journal" };

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey(user.timeZone);
  const monthKey = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : today.slice(0, 7);
  const day = params.day && params.day.startsWith(monthKey) ? params.day : null;
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const [trades, hasAny] = await Promise.all([
    loadClosedTrades(user, { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}` }),
    prisma.trade.count({ where: tradeWhere(user) }),
  ]);
  const stats = computeStats(trades, user.baseCurrency, user.timeZone);
  const calendar = buildCalendarMonth(stats.daily, year, month);
  const currency = user.baseCurrency;

  const dayTrades = day ? await prisma.trade.findMany({ where: { ...tradeWhere(user), status: "CLOSED", closeDayKey: day }, orderBy: { closedAt: "asc" } }) : [];
  const dayStat = day ? stats.daily.find((d) => d.dayKey === day) ?? null : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
          <p className="mt-1 text-sm text-ink-3">Every closed trade, placed on the day it closed. Imported from your broker; nothing here can be edited or removed.</p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/journal?month=${shiftMonth(monthKey, -1)}`} className="btn-secondary px-3" aria-label="Previous month">
            ←
          </Link>
          <span className="num min-w-[9rem] text-center text-sm font-medium">{formatDayKey(`${monthKey}-01`, "monthYear")}</span>
          <Link href={`/journal?month=${shiftMonth(monthKey, 1)}`} className="btn-secondary px-3" aria-label="Next month" aria-disabled={monthKey >= today.slice(0, 7)}>
            →
          </Link>
          {monthKey !== today.slice(0, 7) ? (
            <Link href="/journal" className="btn-ghost text-xs">
              Today
            </Link>
          ) : null}
        </div>
      </div>

      {hasAny === 0 ? (
        <Empty title="No trades yet">
          <p>
            Once a broker is connected and synced, closed trades appear here.{" "}
            <Link href="/accounts" className="underline">
              Connect an account
            </Link>
            .
          </p>
        </Empty>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Month P&L" value={formatMoney(calendar.netPnl, currency, { sign: true })} tone={pnlTone(calendar.netPnl)} sub={`${calendar.count} closed trades`} />
        <StatTile label="Win rate" value={formatPercent(stats.all.winRate, { ratio: true })} sub={`${stats.all.wins}W · ${stats.all.losses}L`} />
        <StatTile label="Green / red days" value={`${calendar.winningDays} / ${calendar.losingDays}`} sub={`${calendar.tradingDays} trading days`} />
        <StatTile label="Profit factor" value={formatRatio(stats.all.profitFactor)} sub={`avg gain ${formatPercent(stats.all.avgPnlPercent, { sign: true })}`} />
      </div>

      <section className="card p-3 md:p-4">
        <Calendar month={calendar} currency={currency} hrefForDay={(d) => `/journal?month=${monthKey}&day=${d}`} selectedDay={day} />
      </section>

      {day ? (
        <section>
          <SectionHeading
            title={formatDayKey(day)}
            description={dayStat ? `${formatMoney(dayStat.netPnl, currency, { sign: true })} across ${dayStat.count} trade${dayStat.count === 1 ? "" : "s"} (${dayStat.wins}W / ${dayStat.losses}L)` : "No closed trades this day"}
            action={
              <Link href={`/journal?month=${monthKey}`} className="btn-ghost text-xs">
                Clear day
              </Link>
            }
          />
          <TradeTable trades={dayTrades} timeZone={user.timeZone} baseCurrency={currency} />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Daily P&L" />
          <div className="card p-4">
            <DailyPnlChart daily={stats.daily} currency={currency} />
          </div>
        </section>
        <section>
          <SectionHeading title="Month statistics" />
          <MetricTable
            compact
            rows={[
              { label: "Net P&L", all: formatMoney(stats.all.netPnl, currency, { sign: true }), wins: formatMoney(stats.all.avgWin === null ? null : stats.all.avgWin * stats.all.wins, currency, { sign: true }), losses: formatMoney(stats.all.avgLoss === null ? null : stats.all.avgLoss * stats.all.losses, currency, { sign: true }) },
              { label: "Trades", all: String(stats.all.count), wins: String(stats.all.wins), losses: String(stats.all.losses) },
              { label: "Average gain", all: formatMoney(stats.all.avgPnl, currency, { sign: true }), wins: formatMoney(stats.all.avgWin, currency, { sign: true }), losses: formatMoney(stats.all.avgLoss, currency, { sign: true }) },
              { label: "Average gain %", all: formatPercent(stats.all.avgPnlPercent, { sign: true }) },
              { label: "Largest", all: "", wins: formatMoney(stats.all.largestWin, currency, { sign: true }), losses: formatMoney(stats.all.largestLoss, currency, { sign: true }) },
              { label: "Average hold", all: formatDuration(stats.all.avgHoldingSeconds), wins: formatDuration(stats.avgHoldingWins), losses: formatDuration(stats.avgHoldingLosses) },
              { label: "Fees", all: formatMoney(stats.all.fees, currency) },
              { label: "Long / short", all: `${stats.long.count} / ${stats.short.count}`, wins: `${stats.long.wins} / ${stats.short.wins}`, losses: `${stats.long.losses} / ${stats.short.losses}` },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
