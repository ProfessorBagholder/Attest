import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fill, approx } from "./helpers.ts";
import { matchFills, totalRealized } from "../match.ts";
import type { Fill } from "../types.ts";

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomSession(seed: number): Fill[] {
  const random = rng(seed);
  const fills: Fill[] = [];
  let position = 0;
  let minute = 0;
  const count = 5 + Math.floor(random() * 20);
  for (let i = 0; i < count; i += 1) {
    minute += 1 + Math.floor(random() * 30);
    const qty = 1 + Math.floor(random() * 50);
    const side = random() < 0.5 ? "BUY" : "SELL";
    position += side === "BUY" ? qty : -qty;
    fills.push(fill({ side, qty, price: 10 + Math.round(random() * 1000) / 100, at: new Date(Date.UTC(2024, 0, 2, 14, minute)).toISOString(), fee: Math.round(random() * 100) / 100 }));
  }
  if (position !== 0) {
    minute += 1;
    fills.push(fill({ side: position > 0 ? "SELL" : "BUY", qty: Math.abs(position), price: 15, at: new Date(Date.UTC(2024, 0, 2, 14, minute)).toISOString() }));
  }
  return fills;
}

describe("matching invariants", () => {
  it("average cost and FIFO realize identical totals when the position ends flat", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const fills = randomSession(seed);
      const avg = matchFills(fills, { method: "AVERAGE_COST" });
      const fifo = matchFills(fills, { method: "FIFO" });
      assert.ok(avg.every((t) => t.status === "CLOSED"), `seed ${seed}: average cost left an open trade`);
      assert.ok(fifo.every((t) => t.status === "CLOSED"), `seed ${seed}: FIFO left an open trade`);
      assert.ok(approx(totalRealized(avg), totalRealized(fifo), 1e-6), `seed ${seed}: ${totalRealized(avg)} vs ${totalRealized(fifo)}`);

      const cash = fills.reduce((sum, f) => sum + (f.side === "SELL" ? 1 : -1) * f.price * f.quantity - f.fee, 0);
      assert.ok(approx(totalRealized(avg), cash, 1e-6), `seed ${seed}: realized ${totalRealized(avg)} differs from cash flow ${cash}`);

      const fees = fills.reduce((sum, f) => sum + f.fee, 0);
      assert.ok(approx(avg.reduce((s, t) => s + t.fees, 0), fees, 1e-6));
      assert.ok(approx(fifo.reduce((s, t) => s + t.fees, 0), fees, 1e-6));
    }
  });

  it("every fill quantity is fully allocated to trade fills", () => {
    for (let seed = 300; seed <= 400; seed += 1) {
      const fills = randomSession(seed);
      for (const method of ["AVERAGE_COST", "FIFO"] as const) {
        const trades = matchFills(fills, { method });
        const allocated = new Map<string, number>();
        for (const trade of trades) {
          for (const tf of trade.fills) allocated.set(tf.fillId, (allocated.get(tf.fillId) ?? 0) + tf.quantity);
        }
        for (const f of fills) {
          assert.ok(approx(allocated.get(f.id) ?? 0, f.quantity, 1e-6), `seed ${seed} ${method}: fill ${f.id} allocated ${allocated.get(f.id)} of ${f.quantity}`);
        }
      }
    }
  });

  it("is independent of input order", () => {
    for (let seed = 500; seed <= 560; seed += 1) {
      const fills = randomSession(seed);
      const shuffled = [...fills].sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : 1));
      const a = matchFills(fills, { method: "AVERAGE_COST" });
      const b = matchFills(shuffled, { method: "AVERAGE_COST" });
      assert.deepEqual(a.map((t) => [t.tradeKey, t.netPnl]), b.map((t) => [t.tradeKey, t.netPnl]));
    }
  });
});
