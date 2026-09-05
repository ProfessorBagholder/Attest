import { prisma } from "./db.ts";
import { hashPassword } from "./crypto.ts";
import { ingestActivities, rebuildTrades } from "./sync.ts";
import type { SnapTradeActivity } from "../engine/normalize.ts";
import { addDays, weekdayOfDayKey } from "../engine/time.ts";

type Instrument = { symbol: string; description: string; currency: "CAD" | "USD"; type: "cs" | "et"; price: number; vol: number };

const CAD_INSTRUMENTS: Instrument[] = [
  { symbol: "SHOP.TO", description: "SHOPIFY INC", currency: "CAD", type: "cs", price: 98, vol: 0.035 },
  { symbol: "XEQT.TO", description: "ISHARES CORE EQUITY ETF PORTFOLIO", currency: "CAD", type: "et", price: 31, vol: 0.01 },
  { symbol: "CNQ.TO", description: "CANADIAN NATURAL RESOURCES", currency: "CAD", type: "cs", price: 46, vol: 0.02 },
  { symbol: "TD.TO", description: "TORONTO-DOMINION BANK", currency: "CAD", type: "cs", price: 79, vol: 0.012 },
  { symbol: "BB.TO", description: "BLACKBERRY LTD", currency: "CAD", type: "cs", price: 4.1, vol: 0.05 },
];

const USD_INSTRUMENTS: Instrument[] = [
  { symbol: "AAPL", description: "APPLE INC", currency: "USD", type: "cs", price: 190, vol: 0.018 },
  { symbol: "NVDA", description: "NVIDIA CORP", currency: "USD", type: "cs", price: 118, vol: 0.035 },
  { symbol: "TSLA", description: "TESLA INC", currency: "USD", type: "cs", price: 245, vol: 0.04 },
  { symbol: "SPY", description: "SPDR S&P 500 ETF TRUST", currency: "USD", type: "et", price: 540, vol: 0.01 },
  { symbol: "SOFI", description: "SOFI TECHNOLOGIES", currency: "USD", type: "cs", price: 7.8, vol: 0.045 },
];

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function nextTradingDay(dayKey: string, random: () => number, maxGap: number): string {
  let day = dayKey;
  const gap = 1 + Math.floor(random() * maxGap);
  for (let i = 0; i < gap; i += 1) {
    day = addDays(day, 1);
    while (weekdayOfDayKey(day) === 0 || weekdayOfDayKey(day) === 6) day = addDays(day, 1);
  }
  return day;
}

function withTime(dayKey: string, random: () => number, timed: boolean): string {
  if (!timed) return `${dayKey}T00:00:00.000Z`;
  const minutes = 14 * 60 + 30 + Math.floor(random() * 380);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${dayKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(Math.floor(random() * 60)).padStart(2, "0")}.000Z`;
}

function activity(kind: "BUY" | "SELL", inst: Instrument, units: number, price: number, at: string, fee = 0): SnapTradeActivity {
  const amount = (kind === "BUY" ? -1 : 1) * units * price - fee;
  return {
    id: `demo-${Math.random().toString(36).slice(2)}`,
    symbol: {
      id: `sym-${inst.symbol}`,
      symbol: inst.symbol,
      raw_symbol: inst.symbol.replace(".TO", ""),
      description: inst.description,
      currency: { code: inst.currency },
      exchange: { code: inst.currency === "CAD" ? "TSX" : "NASDAQ", timezone: "America/Toronto" },
      type: { code: inst.type, description: inst.type === "cs" ? "Common Stock" : "Exchange Traded Fund" },
    },
    option_symbol: null,
    price: Math.round(price * 100) / 100,
    units: kind === "SELL" ? -units : units,
    amount: Math.round(amount * 100) / 100,
    currency: { code: inst.currency },
    type: kind,
    option_type: null,
    description: `${inst.symbol.replace(".TO", "")} - ${inst.description} - ${kind} ${units} @ ${price.toFixed(2)}`,
    trade_date: at,
    settlement_date: `${at.slice(0, 10)}T00:00:00.000Z`,
    fee,
    fx_rate: null,
    institution: "Wealthsimple",
    external_reference_id: null,
  };
}

function cashActivity(type: string, amount: number, at: string, currency: "CAD" | "USD", description: string, symbol?: Instrument): SnapTradeActivity {
  return {
    id: `demo-${Math.random().toString(36).slice(2)}`,
    symbol: symbol
      ? { id: `sym-${symbol.symbol}`, symbol: symbol.symbol, raw_symbol: symbol.symbol, description: symbol.description, currency: { code: currency }, type: { code: symbol.type } }
      : null,
    option_symbol: null,
    price: 0,
    units: 0,
    amount,
    currency: { code: currency },
    type,
    option_type: null,
    description,
    trade_date: `${at}T00:00:00.000Z`,
    settlement_date: `${at}T00:00:00.000Z`,
    fee: 0,
    fx_rate: null,
    institution: "Wealthsimple",
    external_reference_id: null,
  };
}

export function generateDemoActivities(instruments: Instrument[], seed: number, startDay: string, endDay: string, timed: boolean, edge: number): SnapTradeActivity[] {
  const random = rng(seed);
  const out: SnapTradeActivity[] = [];
  const prices = new Map(instruments.map((i) => [i.symbol, i.price]));
  let day = startDay;
  out.push(cashActivity("CONTRIBUTION", 25000, startDay, instruments[0].currency, "Contribution"));
  while (day < endDay) {
    const inst = instruments[Math.floor(random() * instruments.length)];
    const base = prices.get(inst.symbol) ?? inst.price;
    const drift = 1 + (random() - 0.5) * inst.vol * 2;
    prices.set(inst.symbol, base * drift);
    const entry = prices.get(inst.symbol) ?? base;
    const notional = 1500 + random() * 6000;
    const units = inst.price > 50 ? Math.max(1, Math.round(notional / entry)) : Math.round((notional / entry) * 100) / 100;
    const legs = random() < 0.3 ? 2 : 1;
    const opened = day;
    let heldDay = day;
    for (let leg = 0; leg < legs; leg += 1) {
      const legUnits = leg === 0 ? units : Math.max(1, Math.round(units / 2));
      const legPrice = entry * (1 + (random() - 0.5) * inst.vol);
      out.push(activity("BUY", inst, legUnits, legPrice, withTime(heldDay, random, timed)));
      if (legs > 1 && leg === 0) heldDay = random() < 0.5 ? heldDay : nextTradingDay(heldDay, random, 2);
    }
    const totalUnits = legs === 1 ? units : units + Math.max(1, Math.round(units / 2));
    const swing = random();
    const exitDay = swing < 0.45 ? heldDay : swing < 0.8 ? nextTradingDay(heldDay, random, 4) : nextTradingDay(heldDay, random, 25);
    const move = (random() - 0.5 + edge) * inst.vol * (exitDay === heldDay ? 1.2 : 3);
    const exitPrice = entry * (1 + move);
    prices.set(inst.symbol, exitPrice);
    if (random() < 0.25) {
      const first = Math.max(1, Math.round(totalUnits / 2));
      out.push(activity("SELL", inst, first, exitPrice * (1 + (random() - 0.5) * 0.004), withTime(exitDay, random, timed)));
      const laterDay = nextTradingDay(exitDay, random, 3);
      out.push(activity("SELL", inst, totalUnits - first, exitPrice * (1 + (random() - 0.5) * inst.vol), withTime(laterDay, random, timed)));
    } else {
      out.push(activity("SELL", inst, totalUnits, exitPrice, withTime(exitDay, random, timed)));
    }
    if (random() < 0.08) {
      out.push(cashActivity("DIVIDEND", Math.round(random() * 4000) / 100, exitDay, inst.currency, `${inst.symbol} dividend`, inst));
    }
    day = nextTradingDay(opened, random, 3);
  }
  const lastInst = instruments[1];
  out.push(activity("BUY", lastInst, 40, prices.get(lastInst.symbol) ?? lastInst.price, withTime(endDay, random, timed)));
  return out;
}

export type DemoUserSpec = { email: string; username: string; displayName: string; seed: number; edge: number; isPublic: boolean; showDollars: boolean; bio: string };

export const DEMO_USERS: DemoUserSpec[] = [
  { email: "demo@attest.local", username: "demo", displayName: "Demo Trader", seed: 7, edge: 0.12, isPublic: true, showDollars: true, bio: "Swing trading Canadian large caps and US tech. Verified through Wealthsimple." },
  { email: "maple@attest.local", username: "maplealpha", displayName: "Maple Alpha", seed: 21, edge: 0.2, isPublic: true, showDollars: true, bio: "Momentum, mostly intraday. Sharing everything." },
  { email: "quiet@attest.local", username: "quietcompounder", displayName: "Quiet Compounder", seed: 33, edge: 0.05, isPublic: true, showDollars: false, bio: "Percentages only. Long ETFs, occasional single names." },
  { email: "tilt@attest.local", username: "tiltcontrol", displayName: "Tilt Control", seed: 44, edge: -0.08, isPublic: true, showDollars: true, bio: "Documenting the drawdown so I stop repeating it." },
];

export const DEMO_PASSWORD = "demo-password-123";

export async function seedDemo(options: { months?: number } = {}): Promise<void> {
  const months = options.months ?? 9;
  const today = new Date().toISOString().slice(0, 10);
  const start = addDays(today, -Math.round(months * 30.4));
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const spec of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: spec.email } });
    if (existing) await prisma.user.delete({ where: { id: existing.id } });
    const user = await prisma.user.create({
      data: {
        email: spec.email,
        username: spec.username,
        displayName: spec.displayName,
        passwordHash,
        isPublic: spec.isPublic,
        showDollars: spec.showDollars,
        bio: spec.bio,
        timeZone: "America/Toronto",
        baseCurrency: "CAD",
      },
    });
    const connection = await prisma.brokerConnection.create({
      data: {
        userId: user.id,
        snaptradeAuthorizationId: `demo-auth-${spec.username}`,
        brokerageSlug: "WEALTHSIMPLE",
        brokerageName: "Wealthsimple",
        status: "ACTIVE",
        lastSyncedAt: new Date(),
        createdAt: new Date(`${start}T12:00:00.000Z`),
      },
    });
    const tfsa = await prisma.account.create({
      data: {
        userId: user.id,
        connectionId: connection.id,
        snaptradeAccountId: `demo-acct-${spec.username}-tfsa`,
        name: "TFSA",
        number: "WS-TFSA-2841",
        institutionName: "Wealthsimple",
        currency: "CAD",
        rawType: "TFSA",
        status: "open",
        balanceTotal: 31240.55,
        balanceCurrency: "CAD",
        lastSyncedAt: new Date(),
        transactionsSyncedAt: new Date(),
      },
    });
    const usd = await prisma.account.create({
      data: {
        userId: user.id,
        connectionId: connection.id,
        snaptradeAccountId: `demo-acct-${spec.username}-usd`,
        name: "Non-registered (USD)",
        number: "WS-CASH-9917",
        institutionName: "Wealthsimple",
        currency: "USD",
        rawType: "NON_REGISTERED",
        status: "open",
        balanceTotal: 12880.1,
        balanceCurrency: "USD",
        lastSyncedAt: new Date(),
        transactionsSyncedAt: new Date(),
      },
    });
    await ingestActivities(tfsa.id, generateDemoActivities(CAD_INSTRUMENTS, spec.seed, start, today, false, spec.edge));
    await ingestActivities(usd.id, generateDemoActivities(USD_INSTRUMENTS, spec.seed + 1000, start, today, true, spec.edge));
    await prisma.position.createMany({
      data: [
        { accountId: tfsa.id, symbol: "XEQT.TO", description: "ISHARES CORE EQUITY ETF PORTFOLIO", securityType: "et", currency: "CAD", units: 40, price: 31.42, averagePurchasePrice: 30.9, openPnl: 20.8 },
        { accountId: usd.id, symbol: "NVDA", description: "NVIDIA CORP", securityType: "cs", currency: "USD", units: 40, price: 121.3, averagePurchasePrice: 118.7, openPnl: 104 },
      ],
    });
    await rebuildTrades(user.id);
  }
}
