import type { DailyStat } from "./metrics.ts";
import { daysInMonth, pad, weekdayOfDayKey } from "./time.ts";

export type CalendarCell = {
  dayKey: string;
  day: number;
  inMonth: boolean;
  stat: DailyStat | null;
};

export type CalendarWeek = {
  cells: CalendarCell[];
  netPnl: number;
  count: number;
};

export type CalendarMonth = {
  year: number;
  month: number;
  weeks: CalendarWeek[];
  netPnl: number;
  count: number;
  wins: number;
  losses: number;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
};

export function buildCalendarMonth(daily: DailyStat[], year: number, month: number): CalendarMonth {
  const prefix = `${year}-${pad(month)}-`;
  const byDay = new Map<string, DailyStat>();
  for (const stat of daily) if (stat.dayKey.startsWith(prefix)) byDay.set(stat.dayKey, stat);

  const total = daysInMonth(year, month);
  const firstWeekday = weekdayOfDayKey(`${prefix}01`);
  const leading = (firstWeekday + 6) % 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < leading; i += 1) cells.push({ dayKey: "", day: 0, inMonth: false, stat: null });
  for (let day = 1; day <= total; day += 1) {
    const dayKey = `${prefix}${pad(day)}`;
    cells.push({ dayKey, day, inMonth: true, stat: byDay.get(dayKey) ?? null });
  }
  while (cells.length % 7 !== 0) cells.push({ dayKey: "", day: 0, inMonth: false, stat: null });

  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const slice = cells.slice(i, i + 7);
    weeks.push({
      cells: slice,
      netPnl: round(slice.reduce((s, c) => s + (c.stat?.netPnl ?? 0), 0)),
      count: slice.reduce((s, c) => s + (c.stat?.count ?? 0), 0),
    });
  }

  const stats = [...byDay.values()];
  return {
    year,
    month,
    weeks,
    netPnl: round(stats.reduce((s, d) => s + d.netPnl, 0)),
    count: stats.reduce((s, d) => s + d.count, 0),
    wins: stats.reduce((s, d) => s + d.wins, 0),
    losses: stats.reduce((s, d) => s + d.losses, 0),
    tradingDays: stats.length,
    winningDays: stats.filter((d) => d.netPnl > 1e-9).length,
    losingDays: stats.filter((d) => d.netPnl < -1e-9).length,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
