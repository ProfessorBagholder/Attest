import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { run, asStats, approx } from "./helpers.ts";
import { computeStats, sideStats } from "../metrics.ts";
import { starRating } from "../stars.ts";
import { buildCalendarMonth } from "../calendar.ts";
import { localParts } from "../time.ts";

const TZ = "America/Toronto";

function pnlSeries(): ReturnType<typeof asStats> {
  const specs = [
    { side: "BUY" as const, qty: 10, price: 10, at: "2024-03-04T14:30:00Z" },
    { side: "SELL" as const, qty: 10, price: 20, at: "2024-03-04T15:30:00Z" },
    { side: "BUY" as const, qty: 10, price: 10, at: "2024-03-05T14:30:00Z" },
    { side: "SELL" as const, qty: 10, price: 5, at: "2024-03-05T15:30:00Z" },
    { side: "BUY" as const, qty: 10, price: 10, at: "2024-03-06T14:30:00Z" },
    { side: "SELL" as const, qty: 10, price: 30, at: "2024-03-06T15:30:00Z" },
    { side: "BUY" as const, qty: 10, price: 10, at: "2024-03-07T14:30:00Z" },
    { side: "SELL" as const, qty: 10, price: 10, at: "2024-03-07T15:30:00Z" },
    { side: "SELL" as const, qty: 10, price: 10, at: "2024-03-08T14:30:00Z" },
    { side: "BUY" as const, qty: 10, price: 12.5, at: "2024-03-08T15:30:00Z" },
  ];
  return asStats(run(specs));
}

describe("sideStats", () => {
  it("computes the Kinfo headline metrics", () => {
    const stats = sideStats(pnlSeries());
    assert.equal(stats.count, 5);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 2);
    assert.equal(stats.breakeven, 1);
    assert.equal(stats.winRate, 0.4);
    assert.equal(stats.netPnl, 225);
    assert.equal(stats.avgPnl, 45);
    assert.equal(stats.avgWin, 150);
    assert.equal(stats.avgLoss, -37.5);
    assert.equal(stats.largestWin, 200);
    assert.equal(stats.largestLoss, -50);
    assert.equal(stats.profitFactor, 4);
    assert.equal(stats.payoffRatio, 4);
    assert.equal(stats.avgPnlPercent, 45);
    assert.equal(stats.avgHoldingSeconds, 3600);
    assert.equal(stats.volume, 1275);
  });

  it("returns nulls rather than NaN for empty input", () => {
    const stats = sideStats([]);
    assert.equal(stats.winRate, null);
    assert.equal(stats.avgPnl, null);
    assert.equal(stats.profitFactor, null);
    assert.equal(stats.netPnl, 0);
  });

  it("reports an infinite profit factor with wins and no losses", () => {
    const trades = asStats(run([
      { side: "BUY", qty: 1, price: 1, at: "2024-03-04T14:30:00Z" },
      { side: "SELL", qty: 1, price: 2, at: "2024-03-04T15:30:00Z" },
    ]));
    assert.equal(sideStats(trades).profitFactor, Number.POSITIVE_INFINITY);
  });
});

describe("computeStats", () => {
  it("builds streaks, drawdown, daily and equity series", () => {
    const stats = computeStats(pnlSeries(), "USD", TZ);
    assert.equal(stats.streaks.maxConsecutiveWins, 1);
    assert.equal(stats.streaks.maxConsecutiveLosses, 1);
    assert.equal(stats.streaks.currentStreak, -1);
    assert.deepEqual(stats.equityCurve.map((p) => p.cumulative), [100, 50, 250, 250, 225]);
    assert.equal(stats.drawdown.maxDrawdown, 50);
    assert.equal(stats.drawdown.maxDrawdownStart, "2024-03-04");
    assert.equal(stats.drawdown.maxDrawdownEnd, "2024-03-05");
    assert.equal(stats.drawdown.currentDrawdown, 25);
    assert.equal(stats.daily.length, 5);
    assert.equal(stats.tradingDays, 5);
    assert.equal(stats.winningDays, 2);
    assert.equal(stats.losingDays, 2);
    assert.equal(stats.long.count, 4);
    assert.equal(stats.short.count, 1);
    assert.equal(stats.short.netPnl, -25);
    assert.equal(stats.byWeekday.length, 5);
    assert.equal(stats.byWeekday[0].label, "Monday");
    assert.equal(stats.byHour.length, 1);
    assert.equal(stats.byHour[0].label, "09:00");
    assert.equal(stats.byHoldingPeriod[0].key, "intraday");
    assert.equal(stats.byHoldingPeriod[0].count, 5);
    assert.equal(stats.byMonth[0].key, "2024-03");
    assert.equal(stats.bestTrades[0].netPnlBase, 200);
    assert.equal(stats.worstTrades[0].netPnlBase, -50);
    assert.equal(stats.expectancy, 45);
  });

  it("excludes open trades from performance", () => {
    const trades = asStats(run([
      { side: "BUY", qty: 10, price: 10, at: "2024-03-04T14:30:00Z" },
      { side: "SELL", qty: 10, price: 20, at: "2024-03-04T15:30:00Z" },
      { side: "BUY", qty: 10, price: 10, at: "2024-03-05T14:30:00Z" },
    ]));
    const stats = computeStats(trades, "USD", TZ);
    assert.equal(stats.all.count, 1);
    assert.equal(stats.all.netPnl, 100);
  });

  it("attributes date-only fills to their calendar day without timezone shifts", () => {
    const trades = asStats(run([
      { side: "BUY", qty: 1, price: 1, at: "2024-03-04" },
      { side: "SELL", qty: 1, price: 2, at: "2024-03-04" },
    ]));
    const stats = computeStats(trades, "USD", TZ);
    assert.equal(stats.daily[0].dayKey, "2024-03-04");
    assert.equal(stats.byHour.length, 0);
    assert.equal(localParts(new Date("2024-03-04T00:30:00Z"), true, TZ).dayKey, "2024-03-03");
  });
});

describe("starRating", () => {
  it("awards cumulative stars for profitable 30/90/365 day windows", () => {
    const now = new Date("2024-03-10T12:00:00Z");
    const trades = pnlSeries();
    const rating = starRating(trades, TZ, now, 3);
    assert.equal(rating.stars, 3);
    assert.ok(rating.windows.every((w) => w.earned && w.trades === 5));
  });

  it("requires the minimum trade count and profitability", () => {
    const now = new Date("2024-03-10T12:00:00Z");
    const trades = pnlSeries();
    assert.equal(starRating(trades, TZ, now, 6).stars, 0);
    const losing = trades.map((t) => ({ ...t, netPnlBase: -Math.abs(t.netPnlBase) - 1 }));
    assert.equal(starRating(losing, TZ, now, 1).stars, 0);
  });

  it("does not award a later star when an earlier window is unprofitable", () => {
    const specs = [
      { side: "BUY" as const, qty: 10, price: 10, at: "2023-06-01T14:30:00Z" },
      { side: "SELL" as const, qty: 10, price: 50, at: "2023-06-01T15:30:00Z" },
      { side: "BUY" as const, qty: 10, price: 10, at: "2024-03-01T14:30:00Z" },
      { side: "SELL" as const, qty: 10, price: 9, at: "2024-03-01T15:30:00Z" },
    ];
    const rating = starRating(asStats(run(specs)), TZ, new Date("2024-03-10T12:00:00Z"), 1);
    assert.equal(rating.stars, 0);
    assert.equal(rating.windows[2].profitable, true);
  });
});

describe("buildCalendarMonth", () => {
  it("lays out a Monday-first grid with weekly totals", () => {
    const stats = computeStats(pnlSeries(), "USD", TZ);
    const month = buildCalendarMonth(stats.daily, 2024, 3);
    assert.equal(month.weeks.length, 5);
    assert.equal(month.weeks[0].cells[0].inMonth, false);
    assert.equal(month.weeks[0].cells[4].day, 1);
    assert.equal(month.netPnl, 225);
    assert.equal(month.count, 5);
    assert.equal(month.tradingDays, 5);
    const secondWeek = month.weeks[1];
    assert.equal(secondWeek.netPnl, 225);
    assert.equal(secondWeek.cells[0].dayKey, "2024-03-04");
    assert.ok(approx(secondWeek.cells[0].stat?.netPnl ?? 0, 100));
    assert.equal(month.weeks[4].cells[6].inMonth, true);
  });
});
