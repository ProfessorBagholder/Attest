import type { Direction, Trade } from "./types.ts";
import { localParts, monthKey } from "./time.ts";

export type StatsTrade = Trade & {
  netPnlBase: number;
  grossPnlBase: number;
  feesBase: number;
  costBasisBase: number;
  proceedsBase: number;
};

export type SideStats = {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netPnl: number;
  grossPnl: number;
  fees: number;
  avgPnl: number | null;
  avgPnlPercent: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  profitFactor: number | null;
  payoffRatio: number | null;
  avgHoldingSeconds: number | null;
  volume: number;
};

export type Bucket = SideStats & { key: string; label: string };

export type EquityPoint = { at: string; dayKey: string; cumulative: number; tradeKey: string; pnl: number };

export type DailyStat = { dayKey: string; netPnl: number; grossPnl: number; fees: number; count: number; wins: number; losses: number };

export type StreakStats = { maxConsecutiveWins: number; maxConsecutiveLosses: number; currentStreak: number };

export type DrawdownStats = { maxDrawdown: number; maxDrawdownStart: string | null; maxDrawdownEnd: string | null; currentDrawdown: number };

export type PerformanceStats = {
  currency: string;
  timeZone: string;
  all: SideStats;
  long: SideStats;
  short: SideStats;
  expectancy: number | null;
  streaks: StreakStats;
  drawdown: DrawdownStats;
  avgHoldingWins: number | null;
  avgHoldingLosses: number | null;
  daily: DailyStat[];
  equityCurve: EquityPoint[];
  byMonth: Bucket[];
  byWeekday: Bucket[];
  byHour: Bucket[];
  byHoldingPeriod: Bucket[];
  byAssetClass: Bucket[];
  bySymbolTrades: Bucket[];
  bySymbolVolume: Bucket[];
  bestTrades: StatsTrade[];
  worstTrades: StatsTrade[];
  firstTradeDay: string | null;
  lastTradeDay: string | null;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
};

const EPSILON = 1e-9;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function closedAt(trade: StatsTrade): Date {
  return trade.closedAt ?? trade.openedAt;
}

export function tradeVolume(trade: StatsTrade): number {
  return trade.costBasisBase + trade.proceedsBase;
}

export function sideStats(trades: StatsTrade[]): SideStats {
  const count = trades.length;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let netPnl = 0;
  let grossPnl = 0;
  let fees = 0;
  let sumWins = 0;
  let sumLosses = 0;
  let largestWin: number | null = null;
  let largestLoss: number | null = null;
  let pctSum = 0;
  let pctCount = 0;
  let holdingSum = 0;
  let holdingCount = 0;
  let volume = 0;

  for (const trade of trades) {
    const pnl = trade.netPnlBase;
    netPnl += pnl;
    grossPnl += trade.grossPnlBase;
    fees += trade.feesBase;
    volume += tradeVolume(trade);
    if (pnl > EPSILON) {
      wins += 1;
      sumWins += pnl;
      largestWin = largestWin === null ? pnl : Math.max(largestWin, pnl);
    } else if (pnl < -EPSILON) {
      losses += 1;
      sumLosses += pnl;
      largestLoss = largestLoss === null ? pnl : Math.min(largestLoss, pnl);
    } else {
      breakeven += 1;
    }
    if (trade.pnlPercent !== null) {
      pctSum += trade.pnlPercent;
      pctCount += 1;
    }
    if (trade.holdingSeconds !== null) {
      holdingSum += trade.holdingSeconds;
      holdingCount += 1;
    }
  }

  const avgWin = wins > 0 ? sumWins / wins : null;
  const avgLoss = losses > 0 ? sumLosses / losses : null;
  return {
    count,
    wins,
    losses,
    breakeven,
    winRate: count > 0 ? wins / count : null,
    netPnl: roundMoney(netPnl),
    grossPnl: roundMoney(grossPnl),
    fees: roundMoney(fees),
    avgPnl: count > 0 ? roundMoney(netPnl / count) : null,
    avgPnlPercent: pctCount > 0 ? roundMoney(pctSum / pctCount) : null,
    avgWin: avgWin === null ? null : roundMoney(avgWin),
    avgLoss: avgLoss === null ? null : roundMoney(avgLoss),
    largestWin: largestWin === null ? null : roundMoney(largestWin),
    largestLoss: largestLoss === null ? null : roundMoney(largestLoss),
    profitFactor: sumLosses < -EPSILON ? roundMoney(sumWins / Math.abs(sumLosses)) : sumWins > EPSILON ? Number.POSITIVE_INFINITY : null,
    payoffRatio: avgWin !== null && avgLoss !== null && avgLoss < -EPSILON ? roundMoney(avgWin / Math.abs(avgLoss)) : null,
    avgHoldingSeconds: holdingCount > 0 ? Math.round(holdingSum / holdingCount) : null,
    volume: roundMoney(volume),
  };
}

function bucketize(trades: StatsTrade[], keyOf: (trade: StatsTrade) => { key: string; label: string } | null): Map<string, { label: string; trades: StatsTrade[] }> {
  const map = new Map<string, { label: string; trades: StatsTrade[] }>();
  for (const trade of trades) {
    const k = keyOf(trade);
    if (!k) continue;
    const entry = map.get(k.key);
    if (entry) entry.trades.push(trade);
    else map.set(k.key, { label: k.label, trades: [trade] });
  }
  return map;
}

function toBuckets(map: Map<string, { label: string; trades: StatsTrade[] }>): Bucket[] {
  return [...map.entries()].map(([key, value]) => ({ key, label: value.label, ...sideStats(value.trades) }));
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const HOLDING_BUCKETS: Array<{ key: string; label: string; maxSeconds: number }> = [
  { key: "intraday", label: "Intraday", maxSeconds: 0 },
  { key: "1-3d", label: "1–3 days", maxSeconds: 3 * 86400 },
  { key: "4-7d", label: "4–7 days", maxSeconds: 7 * 86400 },
  { key: "1-4w", label: "1–4 weeks", maxSeconds: 28 * 86400 },
  { key: "1-3m", label: "1–3 months", maxSeconds: 92 * 86400 },
  { key: "3m+", label: "Over 3 months", maxSeconds: Number.POSITIVE_INFINITY },
];

export function holdingBucket(trade: StatsTrade, timeZone: string): { key: string; label: string } {
  const open = localParts(trade.openedAt, trade.hasTime, timeZone).dayKey;
  const close = localParts(closedAt(trade), trade.hasTime, timeZone).dayKey;
  if (open === close) return HOLDING_BUCKETS[0];
  const seconds = trade.holdingSeconds ?? 0;
  for (const bucket of HOLDING_BUCKETS.slice(1)) {
    if (seconds <= bucket.maxSeconds) return bucket;
  }
  return HOLDING_BUCKETS[HOLDING_BUCKETS.length - 1];
}

export function computeStreaks(sorted: StatsTrade[]): StreakStats {
  let maxWins = 0;
  let maxLosses = 0;
  let run = 0;
  let runSign = 0;
  for (const trade of sorted) {
    const sign = trade.netPnlBase > EPSILON ? 1 : trade.netPnlBase < -EPSILON ? -1 : 0;
    if (sign === 0) continue;
    if (sign === runSign) run += 1;
    else {
      run = 1;
      runSign = sign;
    }
    if (sign > 0) maxWins = Math.max(maxWins, run);
    else maxLosses = Math.max(maxLosses, run);
  }
  return { maxConsecutiveWins: maxWins, maxConsecutiveLosses: maxLosses, currentStreak: runSign * run };
}

export function computeDrawdown(curve: EquityPoint[]): DrawdownStats {
  let peak = 0;
  let peakAt: string | null = null;
  let maxDrawdown = 0;
  let ddStart: string | null = null;
  let ddEnd: string | null = null;
  for (const point of curve) {
    if (point.cumulative > peak) {
      peak = point.cumulative;
      peakAt = point.dayKey;
    }
    const drawdown = peak - point.cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      ddStart = peakAt;
      ddEnd = point.dayKey;
    }
  }
  const last = curve.length > 0 ? curve[curve.length - 1].cumulative : 0;
  return { maxDrawdown: roundMoney(maxDrawdown), maxDrawdownStart: ddStart, maxDrawdownEnd: ddEnd, currentDrawdown: roundMoney(peak - last) };
}

export function sortByClose(trades: StatsTrade[]): StatsTrade[] {
  return [...trades].sort((a, b) => {
    const t = closedAt(a).getTime() - closedAt(b).getTime();
    if (t !== 0) return t;
    return a.tradeKey < b.tradeKey ? -1 : 1;
  });
}

export function equityCurve(sorted: StatsTrade[], timeZone: string): EquityPoint[] {
  let cumulative = 0;
  return sorted.map((trade) => {
    cumulative = roundMoney(cumulative + trade.netPnlBase);
    const at = closedAt(trade);
    return { at: at.toISOString(), dayKey: localParts(at, trade.hasTime, timeZone).dayKey, cumulative, tradeKey: trade.tradeKey, pnl: trade.netPnlBase };
  });
}

export function dailyStats(sorted: StatsTrade[], timeZone: string): DailyStat[] {
  const map = new Map<string, DailyStat>();
  for (const trade of sorted) {
    const key = localParts(closedAt(trade), trade.hasTime, timeZone).dayKey;
    const day = map.get(key) ?? { dayKey: key, netPnl: 0, grossPnl: 0, fees: 0, count: 0, wins: 0, losses: 0 };
    day.netPnl = roundMoney(day.netPnl + trade.netPnlBase);
    day.grossPnl = roundMoney(day.grossPnl + trade.grossPnlBase);
    day.fees = roundMoney(day.fees + trade.feesBase);
    day.count += 1;
    if (trade.netPnlBase > EPSILON) day.wins += 1;
    else if (trade.netPnlBase < -EPSILON) day.losses += 1;
    map.set(key, day);
  }
  return [...map.values()].sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1));
}

export function computeStats(trades: StatsTrade[], currency: string, timeZone: string): PerformanceStats {
  const closed = sortByClose(trades.filter((t) => t.status === "CLOSED"));
  const all = sideStats(closed);
  const longs = closed.filter((t) => t.direction === "LONG");
  const shorts = closed.filter((t) => t.direction === "SHORT");
  const curve = equityCurve(closed, timeZone);
  const daily = dailyStats(closed, timeZone);
  const wins = closed.filter((t) => t.netPnlBase > EPSILON);
  const losses = closed.filter((t) => t.netPnlBase < -EPSILON);

  const byMonth = toBuckets(bucketize(closed, (t) => {
    const key = monthKey(localParts(closedAt(t), t.hasTime, timeZone).dayKey);
    return { key, label: key };
  })).sort((a, b) => (a.key < b.key ? -1 : 1));

  const byWeekday = toBuckets(bucketize(closed, (t) => {
    const weekday = localParts(closedAt(t), t.hasTime, timeZone).weekday;
    return { key: String(weekday), label: WEEKDAY_LABELS[weekday] };
  })).sort((a, b) => Number(a.key) - Number(b.key));

  const byHour = toBuckets(bucketize(closed, (t) => {
    if (!t.hasTime) return null;
    const hour = localParts(t.openedAt, true, timeZone).hour;
    return { key: String(hour).padStart(2, "0"), label: `${String(hour).padStart(2, "0")}:00` };
  })).sort((a, b) => Number(a.key) - Number(b.key));

  const byHoldingPeriod = toBuckets(bucketize(closed, (t) => holdingBucket(t, timeZone))).sort(
    (a, b) => HOLDING_BUCKETS.findIndex((h) => h.key === a.key) - HOLDING_BUCKETS.findIndex((h) => h.key === b.key),
  );

  const byAssetClass = toBuckets(bucketize(closed, (t) => ({ key: t.assetClass, label: t.assetClass })));

  const symbolKey = (t: StatsTrade) => ({ key: t.option ? t.option.underlying || t.symbol : t.symbol, label: t.option ? t.option.underlying || t.symbol : t.symbol });
  const bySymbolAll = toBuckets(bucketize(closed, symbolKey));
  const bySymbolTrades = [...bySymbolAll].sort((a, b) => b.count - a.count || b.netPnl - a.netPnl).slice(0, 10);
  const bySymbolVolume = [...bySymbolAll].sort((a, b) => b.volume - a.volume).slice(0, 10);

  const byPnl = [...closed].sort((a, b) => b.netPnlBase - a.netPnlBase);

  return {
    currency,
    timeZone,
    all,
    long: sideStats(longs),
    short: sideStats(shorts),
    expectancy: all.avgPnl,
    streaks: computeStreaks(closed),
    drawdown: computeDrawdown(curve),
    avgHoldingWins: sideStats(wins).avgHoldingSeconds,
    avgHoldingLosses: sideStats(losses).avgHoldingSeconds,
    daily,
    equityCurve: curve,
    byMonth,
    byWeekday,
    byHour,
    byHoldingPeriod,
    byAssetClass,
    bySymbolTrades,
    bySymbolVolume,
    bestTrades: byPnl.slice(0, 5),
    worstTrades: byPnl.slice(-5).reverse().filter((t) => t.netPnlBase < -EPSILON),
    firstTradeDay: daily[0]?.dayKey ?? null,
    lastTradeDay: daily[daily.length - 1]?.dayKey ?? null,
    tradingDays: daily.length,
    winningDays: daily.filter((d) => d.netPnl > EPSILON).length,
    losingDays: daily.filter((d) => d.netPnl < -EPSILON).length,
  };
}

export function directionLabel(direction: Direction): string {
  return direction === "LONG" ? "Long" : "Short";
}
