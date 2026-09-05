import type { Prisma, Trade as TradeRow, User } from "@prisma/client";
import { prisma } from "./db.ts";
import { computeStats, type PerformanceStats, type StatsTrade } from "../engine/metrics.ts";
import { starRating, type StarRating } from "../engine/stars.ts";
import { addDays, todayKey } from "../engine/time.ts";
import type { OptionMeta } from "../engine/types.ts";

export type Period = "30d" | "90d" | "ytd" | "1y" | "all" | "month";

export type TradeFilter = {
  accountId?: string;
  symbol?: string;
  from?: string;
  to?: string;
  status?: "OPEN" | "CLOSED";
  direction?: "LONG" | "SHORT";
  assetClass?: string;
};

export function periodRange(period: Period, timeZone: string, month?: string): { from?: string; to?: string; label: string } {
  const today = todayKey(timeZone);
  switch (period) {
    case "30d":
      return { from: addDays(today, -29), to: today, label: "Last 30 days" };
    case "90d":
      return { from: addDays(today, -89), to: today, label: "Last 90 days" };
    case "1y":
      return { from: addDays(today, -364), to: today, label: "Last 12 months" };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today, label: "Year to date" };
    case "month": {
      const key = month ?? today.slice(0, 7);
      const [y, m] = key.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}`, label: key };
    }
    default:
      return { label: "All time" };
  }
}

export function toStatsTrade(row: TradeRow): StatsTrade {
  return {
    tradeKey: row.tradeKey,
    accountId: row.accountId,
    instrumentKey: row.instrumentKey,
    symbol: row.symbol,
    description: row.description,
    assetClass: row.assetClass as StatsTrade["assetClass"],
    option: (row.optionMeta as unknown as OptionMeta | null) ?? null,
    direction: row.direction,
    status: row.status,
    matchingMethod: row.matchingMethod,
    currency: row.currency,
    multiplier: row.multiplier,
    quantity: row.quantity,
    openQuantity: row.openQuantity,
    avgEntryPrice: row.avgEntryPrice,
    avgExitPrice: row.avgExitPrice,
    costBasis: row.costBasis,
    proceeds: row.proceeds,
    grossPnl: row.grossPnl,
    fees: row.fees,
    netPnl: row.netPnl,
    pnlPercent: row.pnlPercent,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    hasTime: row.hasTime,
    holdingSeconds: row.holdingSeconds,
    executions: row.executions,
    fills: [],
    warnings: row.warnings,
    netPnlBase: row.netPnlBase,
    grossPnlBase: row.grossPnlBase,
    feesBase: row.feesBase,
    costBasisBase: row.costBasisBase,
    proceedsBase: Math.round(row.proceeds * row.fxRateToBase * 1e6) / 1e6,
  };
}

export function tradeWhere(user: Pick<User, "id" | "matchingMethod">, filter: TradeFilter = {}): Prisma.TradeWhereInput {
  const where: Prisma.TradeWhereInput = { userId: user.id, matchingMethod: user.matchingMethod };
  if (filter.accountId) where.accountId = filter.accountId;
  if (filter.symbol) where.symbol = { contains: filter.symbol, mode: "insensitive" };
  if (filter.status) where.status = filter.status;
  if (filter.direction) where.direction = filter.direction;
  if (filter.assetClass) where.assetClass = filter.assetClass;
  if (filter.from || filter.to) {
    const range: Prisma.StringNullableFilter = {};
    if (filter.from) range.gte = filter.from;
    if (filter.to) range.lte = filter.to;
    where.closeDayKey = range;
  }
  return where;
}

export async function loadClosedTrades(user: Pick<User, "id" | "matchingMethod">, filter: TradeFilter = {}): Promise<StatsTrade[]> {
  const rows = await prisma.trade.findMany({
    where: { ...tradeWhere(user, filter), status: "CLOSED" },
    orderBy: [{ closedAt: "asc" }, { tradeKey: "asc" }],
  });
  return rows.map(toStatsTrade);
}

export async function statsForUser(user: User, filter: TradeFilter = {}): Promise<PerformanceStats> {
  const trades = await loadClosedTrades(user, filter);
  return computeStats(trades, user.baseCurrency, user.timeZone);
}

export async function ratingForUser(user: User, now = new Date()): Promise<StarRating> {
  const from = addDays(todayKey(user.timeZone, now), -370);
  const trades = await loadClosedTrades(user, { from });
  return starRating(trades, user.timeZone, now);
}

export type LeaderboardEntry = {
  userId: string;
  username: string;
  displayName: string;
  showDollars: boolean;
  netPnl: number;
  currency: string;
  winRate: number | null;
  avgPnlPercent: number | null;
  trades: number;
  stars: number;
  connectedSince: Date | null;
};

export async function leaderboard(period: Period, limit = 50): Promise<LeaderboardEntry[]> {
  const users = await prisma.user.findMany({
    where: { isPublic: true, connections: { some: { status: { in: ["ACTIVE", "DISABLED"] } } } },
    include: { connections: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const entries: LeaderboardEntry[] = [];
  for (const user of users) {
    const range = periodRange(period, user.timeZone);
    const trades = await loadClosedTrades(user, { from: range.from, to: range.to });
    if (trades.length === 0) continue;
    const stats = computeStats(trades, user.baseCurrency, user.timeZone);
    const rating = await ratingForUser(user);
    entries.push({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      showDollars: user.showDollars,
      netPnl: stats.all.netPnl,
      currency: user.baseCurrency,
      winRate: stats.all.winRate,
      avgPnlPercent: stats.all.avgPnlPercent,
      trades: stats.all.count,
      stars: rating.stars,
      connectedSince: user.connections[0]?.createdAt ?? null,
    });
  }
  entries.sort((a, b) => b.netPnl - a.netPnl);
  return entries.slice(0, limit);
}
