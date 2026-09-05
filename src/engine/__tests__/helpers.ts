import { createHash } from "node:crypto";
import type { Fill, FillKind, Side } from "../types.ts";
import type { StatsTrade } from "../metrics.ts";
import { matchFills } from "../match.ts";
import type { MatchingMethod, Trade } from "../types.ts";

let counter = 0;

export type FillSpec = {
  side: Side;
  qty: number;
  price: number;
  at: string;
  fee?: number;
  symbol?: string;
  account?: string;
  currency?: string;
  multiplier?: number;
  kind?: FillKind;
  priceUnknown?: boolean;
  assetClass?: Fill["assetClass"];
};

export function fill(spec: FillSpec): Fill {
  counter += 1;
  const symbol = spec.symbol ?? "AAPL";
  const currency = spec.currency ?? "USD";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(spec.at);
  const executedAt = new Date(dateOnly ? `${spec.at}T00:00:00.000Z` : spec.at);
  const isOption = (spec.multiplier ?? 1) !== 1 || spec.assetClass === "OPTION";
  const fingerprint = createHash("sha256").update(`${counter}|${spec.side}|${spec.qty}|${spec.price}|${spec.at}`).digest("hex");
  return {
    id: `fill-${counter}`,
    fingerprint,
    accountId: spec.account ?? "acct-1",
    instrumentKey: `${isOption ? "OPT" : "EQ"}:${symbol}:${currency}`,
    symbol,
    description: null,
    assetClass: spec.assetClass ?? (isOption ? "OPTION" : "EQUITY"),
    kind: spec.kind ?? "TRADE",
    side: spec.side,
    quantity: spec.qty,
    price: spec.price,
    fee: spec.fee ?? 0,
    multiplier: spec.multiplier ?? 1,
    currency,
    fxRate: null,
    executedAt,
    hasTime: !dateOnly,
    settledAt: null,
    option: isOption ? { underlying: symbol, optionType: "CALL", strike: 100, expiration: "2030-01-17" } : null,
    priceUnknown: spec.priceUnknown ?? false,
  };
}

export function run(specs: FillSpec[], method: MatchingMethod = "AVERAGE_COST"): Trade[] {
  return matchFills(specs.map(fill), { method });
}

export function asStats(trades: Trade[]): StatsTrade[] {
  return trades.map((t) => ({ ...t, netPnlBase: t.netPnl, grossPnlBase: t.grossPnl, feesBase: t.fees, costBasisBase: t.costBasis, proceedsBase: t.proceeds }));
}

export function approx(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
