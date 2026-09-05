import Link from "next/link";
import type { CalendarMonth } from "@/engine/calendar";
import { formatMoney, formatDayKey, pnlTone } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Calendar({
  month,
  currency,
  hideDollars = false,
  hrefForDay,
  selectedDay,
  compact = false,
}: {
  month: CalendarMonth;
  currency: string;
  hideDollars?: boolean;
  hrefForDay?: (dayKey: string) => string;
  selectedDay?: string | null;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)]">
        {WEEKDAYS.map((day) => (
          <div key={day} className="label px-1 pb-1 text-center">
            {day}
          </div>
        ))}
        <div className="label hidden px-1 pb-1 text-center md:block">Week</div>
        {month.weeks.map((week, wi) => (
          <WeekRow key={wi} week={week} currency={currency} hideDollars={hideDollars} hrefForDay={hrefForDay} selectedDay={selectedDay} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function WeekRow({
  week,
  currency,
  hideDollars,
  hrefForDay,
  selectedDay,
  compact,
}: {
  week: CalendarMonth["weeks"][number];
  currency: string;
  hideDollars: boolean;
  hrefForDay?: (dayKey: string) => string;
  selectedDay?: string | null;
  compact: boolean;
}) {
  return (
    <>
      {week.cells.map((cell, ci) => {
        if (!cell.inMonth) return <div key={ci} className={`rounded-xl ${compact ? "min-h-[44px]" : "min-h-[72px]"}`} aria-hidden />;
        const tone = cell.stat ? pnlTone(cell.stat.netPnl) : null;
        const selected = selectedDay === cell.dayKey;
        const body = (
          <div
            className={`calendar-cell ${compact ? "min-h-[44px] p-1.5" : ""} ${selected ? "ring-2 ring-ink" : ""}`}
            data-tone={tone ?? undefined}
            title={cell.stat ? `${formatDayKey(cell.dayKey)}: ${formatMoney(cell.stat.netPnl, currency, { sign: true })} over ${cell.stat.count} trade${cell.stat.count === 1 ? "" : "s"}` : formatDayKey(cell.dayKey)}
          >
            <span className={`num ${cell.stat ? "text-ink" : "text-ink-3"}`}>{cell.day}</span>
            {cell.stat ? (
              <span className="flex flex-col">
                <span className={`num font-medium ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink-2"}`}>
                  {hideDollars ? (tone === "gain" ? "▲" : tone === "loss" ? "▼" : "•") : formatMoney(cell.stat.netPnl, currency, { sign: true, compact: true })}
                </span>
                {!compact ? <span className="text-ink-3">{cell.stat.count} trade{cell.stat.count === 1 ? "" : "s"}</span> : null}
              </span>
            ) : null}
          </div>
        );
        return hrefForDay && cell.stat ? (
          <Link key={cell.dayKey} href={hrefForDay(cell.dayKey)} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            {body}
          </Link>
        ) : (
          <div key={cell.dayKey}>{body}</div>
        );
      })}
      <div className={`hidden flex-col justify-center rounded-xl bg-paper-2 px-2 text-xs md:flex ${compact ? "min-h-[44px]" : "min-h-[72px]"}`}>
        <span className={`num font-medium ${week.count ? (pnlTone(week.netPnl) === "gain" ? "text-gain" : pnlTone(week.netPnl) === "loss" ? "text-loss" : "text-ink-2") : "text-ink-3"}`}>
          {week.count ? (hideDollars ? (week.netPnl > 0 ? "▲" : week.netPnl < 0 ? "▼" : "•") : formatMoney(week.netPnl, currency, { sign: true, compact: true })) : "—"}
        </span>
        {week.count ? <span className="text-ink-3">{week.count} trade{week.count === 1 ? "" : "s"}</span> : null}
      </div>
    </>
  );
}
