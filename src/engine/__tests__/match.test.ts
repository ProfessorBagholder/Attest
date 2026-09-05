import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { run, fill, approx } from "./helpers.ts";
import { matchFills, totalRealized } from "../match.ts";

describe("average cost matching (Kinfo parity)", () => {
  it("buy 1 share, sell 2 days later is one closed long trade", () => {
    const trades = run([
      { side: "BUY", qty: 1, price: 150, at: "2024-03-01T14:30:00Z" },
      { side: "SELL", qty: 1, price: 160, at: "2024-03-03T15:00:00Z" },
    ]);
    assert.equal(trades.length, 1);
    const [t] = trades;
    assert.equal(t.status, "CLOSED");
    assert.equal(t.direction, "LONG");
    assert.equal(t.quantity, 1);
    assert.equal(t.grossPnl, 10);
    assert.equal(t.netPnl, 10);
    assert.equal(t.avgEntryPrice, 150);
    assert.equal(t.avgExitPrice, 160);
    assert.ok(approx(t.pnlPercent ?? 0, (10 / 150) * 100));
    assert.equal(t.holdingSeconds, 2 * 86400 + 1800);
    assert.equal(t.executions, 2);
  });

  it("scaling in and out produces a single trade at average cost", () => {
    const trades = run([
      { side: "BUY", qty: 100, price: 10, at: "2024-01-02T14:30:00Z" },
      { side: "BUY", qty: 100, price: 12, at: "2024-01-02T14:45:00Z" },
      { side: "SELL", qty: 100, price: 15, at: "2024-01-03T14:30:00Z" },
      { side: "SELL", qty: 100, price: 14, at: "2024-01-04T14:30:00Z" },
    ]);
    assert.equal(trades.length, 1);
    const [t] = trades;
    assert.equal(t.quantity, 200);
    assert.equal(t.avgEntryPrice, 11);
    assert.equal(t.avgExitPrice, 14.5);
    assert.equal(t.costBasis, 2200);
    assert.equal(t.proceeds, 2900);
    assert.equal(t.grossPnl, 700);
    assert.ok(approx(t.pnlPercent ?? 0, (700 / 2200) * 100));
    assert.equal(t.fills.filter((f) => f.role === "OPEN").length, 2);
    assert.equal(t.fills.filter((f) => f.role === "CLOSE").length, 2);
  });

  it("adding after a partial exit re-averages the remaining cost", () => {
    const trades = run([
      { side: "BUY", qty: 100, price: 10, at: "2024-01-02T14:30:00Z" },
      { side: "SELL", qty: 50, price: 12, at: "2024-01-02T15:30:00Z" },
      { side: "BUY", qty: 50, price: 14, at: "2024-01-02T16:30:00Z" },
      { side: "SELL", qty: 100, price: 13, at: "2024-01-02T17:30:00Z" },
    ]);
    assert.equal(trades.length, 1);
    const [t] = trades;
    assert.equal(t.grossPnl, 200);
    assert.equal(t.quantity, 150);
    assert.equal(t.status, "CLOSED");
  });

  it("handles short trades", () => {
    const trades = run([
      { side: "SELL", qty: 50, price: 20, at: "2024-02-01T14:30:00Z" },
      { side: "BUY", qty: 50, price: 18, at: "2024-02-01T15:30:00Z" },
    ]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].direction, "SHORT");
    assert.equal(trades[0].grossPnl, 100);
    assert.ok(approx(trades[0].pnlPercent ?? 0, 10));
  });

  it("splits a fill that crosses through zero into two trades", () => {
    const trades = run([
      { side: "BUY", qty: 100, price: 10, at: "2024-02-01T14:30:00Z" },
      { side: "SELL", qty: 150, price: 12, at: "2024-02-01T15:30:00Z", fee: 3 },
      { side: "BUY", qty: 50, price: 11, at: "2024-02-01T16:30:00Z" },
    ]);
    assert.equal(trades.length, 2);
    const [long, short] = trades;
    assert.equal(long.direction, "LONG");
    assert.equal(long.grossPnl, 200);
    assert.equal(long.fees, 2);
    assert.equal(short.direction, "SHORT");
    assert.equal(short.quantity, 50);
    assert.equal(short.grossPnl, 50);
    assert.equal(short.fees, 1);
    assert.equal(totalRealized(trades), 247);
  });

  it("subtracts fees from gross to produce net", () => {
    const trades = run([
      { side: "BUY", qty: 10, price: 100, at: "2024-02-01T14:30:00Z", fee: 1 },
      { side: "SELL", qty: 10, price: 110, at: "2024-02-02T14:30:00Z", fee: 1 },
    ]);
    assert.equal(trades[0].grossPnl, 100);
    assert.equal(trades[0].fees, 2);
    assert.equal(trades[0].netPnl, 98);
    assert.ok(approx(trades[0].pnlPercent ?? 0, 9.8));
  });

  it("applies the 100 multiplier for option contracts", () => {
    const trades = run([
      { side: "BUY", qty: 2, price: 1.5, at: "2024-02-01T14:30:00Z", multiplier: 100, symbol: "SPY" },
      { side: "SELL", qty: 2, price: 2, at: "2024-02-01T15:30:00Z", multiplier: 100, symbol: "SPY" },
    ]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].grossPnl, 100);
    assert.equal(trades[0].costBasis, 300);
    assert.equal(trades[0].assetClass, "OPTION");
  });

  it("closes an option at zero on expiration", () => {
    const trades = run([
      { side: "BUY", qty: 1, price: 0.5, at: "2024-02-01T14:30:00Z", multiplier: 100, symbol: "SPY" },
      { side: "SELL", qty: 1, price: 0, at: "2024-02-16", multiplier: 100, symbol: "SPY", kind: "EXPIRATION" },
    ]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].status, "CLOSED");
    assert.equal(trades[0].grossPnl, -50);
    assert.equal(trades[0].fills[1].kind, "EXPIRATION");
  });

  it("expiration of a short option realizes the full premium", () => {
    const trades = run([
      { side: "SELL", qty: 3, price: 1.2, at: "2024-02-01T14:30:00Z", multiplier: 100, symbol: "QQQ" },
      { side: "BUY", qty: 3, price: 0, at: "2024-02-16", multiplier: 100, symbol: "QQQ", kind: "EXPIRATION" },
    ]);
    assert.equal(trades[0].direction, "SHORT");
    assert.equal(trades[0].grossPnl, 360);
  });

  it("orders same-day fills so a flat position buys before it sells", () => {
    const trades = matchFills(
      [
        fill({ side: "SELL", qty: 10, price: 6, at: "2024-02-01" }),
        fill({ side: "BUY", qty: 10, price: 5, at: "2024-02-01" }),
      ],
      { method: "AVERAGE_COST" },
    );
    assert.equal(trades.length, 1);
    assert.equal(trades[0].direction, "LONG");
    assert.equal(trades[0].grossPnl, 10);
    assert.equal(trades[0].hasTime, false);
    assert.equal(trades[0].holdingSeconds, 0);
  });

  it("orders same-day fills so an open short covers before it re-shorts", () => {
    const trades = run([
      { side: "SELL", qty: 10, price: 6, at: "2024-02-01" },
      { side: "BUY", qty: 10, price: 5, at: "2024-02-02" },
      { side: "SELL", qty: 10, price: 7, at: "2024-02-02" },
    ]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].status, "OPEN");
    assert.equal(trades[0].openQuantity, 10);
    assert.equal(trades[0].avgEntryPrice, 6.5);
    assert.equal(trades[0].grossPnl, 15);
  });

  it("keeps fractional share positions and closes within tolerance", () => {
    const trades = run([
      { side: "BUY", qty: 0.3333, price: 30, at: "2024-02-01T14:30:00Z" },
      { side: "BUY", qty: 0.6667, price: 30, at: "2024-02-01T14:31:00Z" },
      { side: "SELL", qty: 1, price: 33, at: "2024-02-02T14:30:00Z" },
    ]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].status, "CLOSED");
    assert.ok(approx(trades[0].grossPnl, 3));
  });

  it("never matches across accounts or currencies", () => {
    const trades = run([
      { side: "BUY", qty: 10, price: 5, at: "2024-02-01T14:30:00Z", account: "a" },
      { side: "SELL", qty: 10, price: 6, at: "2024-02-01T15:30:00Z", account: "b" },
      { side: "BUY", qty: 10, price: 5, at: "2024-02-01T14:30:00Z", account: "a", currency: "CAD" },
    ]);
    assert.equal(trades.length, 3);
    assert.ok(trades.every((t) => t.status === "OPEN"));
  });

  it("leaves an open position as an OPEN trade with realized partial P&L", () => {
    const trades = run([
      { side: "BUY", qty: 100, price: 10, at: "2024-02-01T14:30:00Z" },
      { side: "SELL", qty: 40, price: 12, at: "2024-02-02T14:30:00Z" },
    ]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].status, "OPEN");
    assert.equal(trades[0].openQuantity, 60);
    assert.equal(trades[0].grossPnl, 80);
    assert.equal(trades[0].pnlPercent, null);
    assert.equal(trades[0].closedAt, null);
  });

  it("flags an expiration with no open position instead of throwing", () => {
    const trades = run([{ side: "SELL", qty: 1, price: 0, at: "2024-02-16", multiplier: 100, kind: "EXPIRATION" }]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].netPnl, 0);
    assert.equal(trades[0].warnings.length, 1);
  });

  it("flags transfers with unknown cost basis", () => {
    const trades = run([
      { side: "BUY", qty: 10, price: 0, at: "2024-02-01", kind: "TRANSFER_IN", priceUnknown: true },
      { side: "SELL", qty: 10, price: 20, at: "2024-02-05" },
    ]);
    assert.equal(trades.length, 1);
    assert.ok(trades[0].warnings[0].includes("cost basis"));
  });

  it("produces stable trade keys across reruns", () => {
    const specs = [
      { side: "BUY" as const, qty: 10, price: 5, at: "2024-02-01T14:30:00Z" },
      { side: "SELL" as const, qty: 10, price: 6, at: "2024-02-01T15:30:00Z" },
    ];
    const fills = specs.map(fill);
    const a = matchFills(fills, { method: "AVERAGE_COST" });
    const b = matchFills([...fills].reverse(), { method: "AVERAGE_COST" });
    assert.equal(a[0].tradeKey, b[0].tradeKey);
  });
});

describe("FIFO matching", () => {
  it("creates one round trip per closing execution against the earliest lots", () => {
    const trades = run(
      [
        { side: "BUY", qty: 100, price: 10, at: "2024-01-02T14:30:00Z" },
        { side: "BUY", qty: 100, price: 12, at: "2024-01-02T14:45:00Z" },
        { side: "SELL", qty: 100, price: 15, at: "2024-01-03T14:30:00Z" },
        { side: "SELL", qty: 100, price: 14, at: "2024-01-04T14:30:00Z" },
      ],
      "FIFO",
    );
    assert.equal(trades.length, 2);
    assert.equal(trades[0].grossPnl, 500);
    assert.equal(trades[0].avgEntryPrice, 10);
    assert.equal(trades[0].avgExitPrice, 15);
    assert.equal(trades[1].grossPnl, 200);
    assert.equal(trades[1].avgEntryPrice, 12);
    assert.equal(totalRealized(trades), 700);
  });

  it("a closing fill spanning several lots gets a weighted entry", () => {
    const trades = run(
      [
        { side: "BUY", qty: 100, price: 10, at: "2024-01-02T14:30:00Z", fee: 2 },
        { side: "BUY", qty: 100, price: 12, at: "2024-01-02T14:45:00Z", fee: 2 },
        { side: "SELL", qty: 150, price: 15, at: "2024-01-03T14:30:00Z", fee: 3 },
      ],
      "FIFO",
    );
    assert.equal(trades.length, 2);
    const [closed, open] = trades[0].status === "CLOSED" ? trades : [trades[1], trades[0]];
    assert.equal(closed.quantity, 150);
    assert.equal(closed.grossPnl, 650);
    assert.ok(approx(closed.avgEntryPrice, 1600 / 150));
    assert.equal(closed.fees, 2 + 1 + 3);
    assert.equal(closed.netPnl, 644);
    assert.equal(open.status, "OPEN");
    assert.equal(open.openQuantity, 50);
    assert.equal(open.avgEntryPrice, 12);
    assert.equal(open.fees, 1);
  });

  it("realizes the same total as average cost once the position is flat", () => {
    const specs = [
      { side: "BUY" as const, qty: 30, price: 10, at: "2024-01-02T14:30:00Z" },
      { side: "SELL" as const, qty: 10, price: 11, at: "2024-01-02T14:40:00Z" },
      { side: "BUY" as const, qty: 20, price: 9, at: "2024-01-02T14:50:00Z" },
      { side: "SELL" as const, qty: 25, price: 12, at: "2024-01-02T15:00:00Z" },
      { side: "SELL" as const, qty: 25, price: 8, at: "2024-01-02T15:10:00Z", fee: 1 },
      { side: "BUY" as const, qty: 10, price: 7, at: "2024-01-02T15:20:00Z" },
    ];
    const avg = run(specs, "AVERAGE_COST");
    const fifo = run(specs, "FIFO");
    assert.ok(approx(totalRealized(avg), totalRealized(fifo)));
    assert.equal(avg.length, 2);
    assert.ok(fifo.length > avg.length);
  });
});
