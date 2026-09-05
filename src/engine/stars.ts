import type { StatsTrade } from "./metrics.ts";
import { addDays, localParts, todayKey } from "./time.ts";

export const STAR_WINDOWS = [30, 90, 365] as const;

export type StarWindow = {
  days: number;
  netPnl: number;
  trades: number;
  profitable: boolean;
  earned: boolean;
};

export type StarRating = {
  stars: 0 | 1 | 2 | 3;
  windows: StarWindow[];
  minTrades: number;
};

export function starRating(trades: StatsTrade[], timeZone: string, now: Date = new Date(), minTrades = 3): StarRating {
  const today = todayKey(timeZone, now);
  const windows: StarWindow[] = [];
  let stars: 0 | 1 | 2 | 3 = 0;
  let chain = true;
  for (const days of STAR_WINDOWS) {
    const from = addDays(today, -(days - 1));
    let netPnl = 0;
    let count = 0;
    for (const trade of trades) {
      if (trade.status !== "CLOSED") continue;
      const at = trade.closedAt ?? trade.openedAt;
      const key = localParts(at, trade.hasTime, timeZone).dayKey;
      if (key >= from && key <= today) {
        netPnl += trade.netPnlBase;
        count += 1;
      }
    }
    const profitable = netPnl > 1e-9;
    const earned = chain && profitable && count >= minTrades;
    if (!earned) chain = false;
    if (earned) stars = (stars + 1) as 0 | 1 | 2 | 3;
    windows.push({ days, netPnl: Math.round(netPnl * 100) / 100, trades: count, profitable, earned });
  }
  return { stars, windows, minTrades };
}
