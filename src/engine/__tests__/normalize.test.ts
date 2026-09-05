import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeActivity, fingerprintActivity, parseActivityDate, type SnapTradeActivity } from "../normalize.ts";

const equityBuy: SnapTradeActivity = {
  id: "2f7c3f9a-1111-4b2e-9f1a-000000000001",
  symbol: {
    id: "sym-1",
    symbol: "SHOP.TO",
    raw_symbol: "SHOP",
    description: "SHOPIFY INC",
    currency: { code: "CAD" },
    exchange: { code: "TSX", timezone: "America/Toronto" },
    type: { code: "cs", description: "Common Stock" },
  },
  option_symbol: null,
  price: 98.5,
  units: 10,
  amount: -985,
  currency: { code: "CAD" },
  type: "BUY",
  description: "SHOP - SHOPIFY INC - BUY 10 @ 98.50",
  trade_date: "2024-05-06T00:00:00.000Z",
  settlement_date: "2024-05-08T00:00:00.000Z",
  fee: 0,
  fx_rate: null,
  institution: "Wealthsimple",
  external_reference_id: null,
};

describe("normalizeActivity", () => {
  it("maps a BUY into a long-opening fill with a calendar date", () => {
    const fill = normalizeActivity("acct", "row-1", equityBuy);
    assert.ok(fill);
    assert.equal(fill.side, "BUY");
    assert.equal(fill.quantity, 10);
    assert.equal(fill.price, 98.5);
    assert.equal(fill.currency, "CAD");
    assert.equal(fill.instrumentKey, "EQ:SHOP.TO:CAD");
    assert.equal(fill.assetClass, "EQUITY");
    assert.equal(fill.multiplier, 1);
    assert.equal(fill.hasTime, false);
    assert.equal(fill.executedAt.toISOString(), "2024-05-06T00:00:00.000Z");
  });

  it("derives the side from the type, not the sign of units", () => {
    const sell = normalizeActivity("acct", "row-2", { ...equityBuy, type: "SELL", units: -10, amount: 1000 });
    assert.ok(sell);
    assert.equal(sell.side, "SELL");
    assert.equal(sell.quantity, 10);
  });

  it("ignores cash activities", () => {
    assert.equal(normalizeActivity("acct", "row-3", { ...equityBuy, type: "DIVIDEND", units: 0, amount: 12.4 }), null);
    assert.equal(normalizeActivity("acct", "row-4", { ...equityBuy, type: "CONTRIBUTION", symbol: null, units: 0, amount: 500 }), null);
  });

  it("fingerprints are stable when the brokerage id changes", () => {
    const a = fingerprintActivity("acct", equityBuy);
    const b = fingerprintActivity("acct", { ...equityBuy, id: "another-id" });
    const c = fingerprintActivity("acct", { ...equityBuy, price: 98.51 });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, fingerprintActivity("other-account", equityBuy));
  });

  it("classifies options with a 100 multiplier and an option instrument key", () => {
    const fill = normalizeActivity("acct", "row-5", {
      ...equityBuy,
      symbol: null,
      option_symbol: {
        id: "opt-1",
        ticker: "AAPL  240621C00190000",
        option_type: "CALL",
        strike_price: 190,
        expiration_date: "2024-06-21",
        is_mini_option: false,
        underlying_symbol: { symbol: "AAPL", description: "APPLE INC", currency: { code: "USD" } },
      },
      currency: { code: "USD" },
      option_type: "BUY_TO_OPEN",
      type: "BUY",
      price: 2.35,
      units: 3,
      amount: -705,
    });
    assert.ok(fill);
    assert.equal(fill.assetClass, "OPTION");
    assert.equal(fill.multiplier, 100);
    assert.equal(fill.currency, "USD");
    assert.equal(fill.instrumentKey, "OPT:AAPL 240621C00190000:USD");
    assert.equal(fill.symbol, "AAPL 2024-06-21 190C");
    assert.equal(fill.option?.strike, 190);
  });

  it("turns OPTIONEXPIRATION into a zero-priced closing fill", () => {
    const fill = normalizeActivity("acct", "row-6", {
      ...equityBuy,
      symbol: null,
      option_symbol: { ticker: "AAPL  240621C00190000", option_type: "CALL", strike_price: 190, expiration_date: "2024-06-21", underlying_symbol: { symbol: "AAPL", currency: { code: "USD" } } },
      type: "OPTIONEXPIRATION",
      price: 0,
      units: 3,
      amount: 0,
      trade_date: "2024-06-21",
    });
    assert.ok(fill);
    assert.equal(fill.kind, "EXPIRATION");
    assert.equal(fill.price, 0);
    assert.equal(fill.quantity, 3);
  });

  it("detects timestamps with a real time component", () => {
    assert.equal(parseActivityDate("2024-05-06T13:31:07.000Z")?.hasTime, true);
    assert.equal(parseActivityDate("2024-05-06T00:00:00Z")?.hasTime, false);
    assert.equal(parseActivityDate("2024-05-06")?.hasTime, false);
    assert.equal(parseActivityDate("garbage"), null);
  });

  it("classifies ETFs and crypto", () => {
    const etf = normalizeActivity("acct", "r", { ...equityBuy, symbol: { ...equityBuy.symbol, type: { code: "et" } } });
    const crypto = normalizeActivity("acct", "r", { ...equityBuy, symbol: { ...equityBuy.symbol, symbol: "BTC", type: { code: "crypto" } } });
    assert.equal(etf?.assetClass, "ETF");
    assert.equal(crypto?.assetClass, "CRYPTO");
  });
});
