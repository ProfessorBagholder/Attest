import { createHash } from "node:crypto";
import type { Direction, Fill, FillKind, MatchOptions, MatchingMethod, Side, Trade, TradeFill } from "./types.ts";

const DEFAULT_EPSILON = 1e-9;

const CLOSING_KINDS: ReadonlySet<FillKind> = new Set(["EXPIRATION", "ASSIGNMENT", "EXERCISE"]);

type Lot = {
  fill: Fill;
  quantity: number;
  fee: number;
};

type Cycle = {
  direction: Direction;
  fills: TradeFill[];
  openQuantity: number;
  remainingCost: number;
  openedQuantity: number;
  closedQuantity: number;
  totalOpenCost: number;
  totalCloseProceeds: number;
  grossPnl: number;
  fees: number;
  openedAt: Date;
  lastAt: Date;
  hasTime: boolean;
  warnings: string[];
  openFingerprint: string;
  sequence: number;
  lots: Lot[];
};

function roundMoney(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function nearlyZero(value: number, epsilon: number): boolean {
  return Math.abs(value) < epsilon;
}

function sideDirection(side: Side): Direction {
  return side === "BUY" ? "LONG" : "SHORT";
}

function directionSign(direction: Direction): number {
  return direction === "LONG" ? 1 : -1;
}

function hashKey(parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export function sortFills(fills: Fill[]): Fill[] {
  return [...fills].sort((a, b) => {
    const t = a.executedAt.getTime() - b.executedAt.getTime();
    if (t !== 0) return t;
    const sa = a.settledAt?.getTime() ?? 0;
    const sb = b.settledAt?.getTime() ?? 0;
    if (sa !== sb) return sa - sb;
    return a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0;
  });
}

export function orderTieGroup(group: Fill[], positionDirection: Direction | null): Fill[] {
  if (group.length <= 1) return group;
  const extendSide: Side = positionDirection === "SHORT" ? "SELL" : "BUY";
  const rank = (fill: Fill): number => {
    if (CLOSING_KINDS.has(fill.kind)) return 2;
    return fill.side === extendSide ? 0 : 1;
  };
  return [...group].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0;
  });
}

export function groupFillsByInstrument(fills: Fill[]): Map<string, Fill[]> {
  const groups = new Map<string, Fill[]>();
  for (const fill of fills) {
    const key = `${fill.accountId}::${fill.instrumentKey}`;
    const list = groups.get(key);
    if (list) list.push(fill);
    else groups.set(key, [fill]);
  }
  return groups;
}

export function matchFills(fills: Fill[], options: MatchOptions): Trade[] {
  const epsilon = options.quantityEpsilon ?? DEFAULT_EPSILON;
  const trades: Trade[] = [];
  for (const group of groupFillsByInstrument(fills).values()) {
    const sorted = sortFills(group);
    const matcher = new InstrumentMatcher(options.method, epsilon);
    let index = 0;
    while (index < sorted.length) {
      const at = sorted[index].executedAt.getTime();
      let end = index;
      while (end < sorted.length && sorted[end].executedAt.getTime() === at) end += 1;
      const tie = orderTieGroup(sorted.slice(index, end), matcher.currentDirection());
      for (const fill of tie) matcher.apply(fill);
      index = end;
    }
    trades.push(...matcher.finish());
  }
  trades.sort((a, b) => {
    const ta = (a.closedAt ?? a.openedAt).getTime();
    const tb = (b.closedAt ?? b.openedAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.tradeKey < b.tradeKey ? -1 : 1;
  });
  return trades;
}

class InstrumentMatcher {
  private readonly method: MatchingMethod;
  private readonly epsilon: number;
  private cycle: Cycle | null = null;
  private trades: Trade[] = [];
  private sequence = 0;
  private template: Fill | null = null;
  private pendingWarning: string | null = null;
  private fifoCloseIndex = 0;

  constructor(method: MatchingMethod, epsilon: number) {
    this.method = method;
    this.epsilon = epsilon;
  }

  currentDirection(): Direction | null {
    return this.cycle?.direction ?? null;
  }

  apply(fill: Fill): void {
    this.template = this.template ?? fill;
    const cycle = this.cycle;

    if (CLOSING_KINDS.has(fill.kind)) {
      if (!cycle) {
        this.orphan(fill, `${fill.kind} received with no open position`);
        return;
      }
      const closingSide: Side = cycle.direction === "LONG" ? "SELL" : "BUY";
      const quantity = Math.min(fill.quantity, cycle.openQuantity);
      if (fill.quantity - quantity > this.epsilon) {
        cycle.warnings.push(`${fill.kind} quantity ${fill.quantity} exceeded open position ${cycle.openQuantity}`);
      }
      this.reduce(cycle, { ...fill, side: closingSide }, quantity, fill.fee);
      return;
    }

    if (fill.priceUnknown) {
      this.pendingWarning = `${fill.kind} without a known price; cost basis may be inaccurate`;
    }

    if (!cycle) {
      this.open(fill, fill.quantity, fill.fee);
      return;
    }

    const extends_ = sideDirection(fill.side) === cycle.direction;
    if (extends_) {
      this.extend(cycle, fill, fill.quantity, fill.fee);
      return;
    }

    const closable = Math.min(fill.quantity, cycle.openQuantity);
    const remainder = fill.quantity - closable;
    const closeFee = remainder > this.epsilon ? (fill.fee * closable) / fill.quantity : fill.fee;
    this.reduce(cycle, fill, closable, closeFee);
    if (remainder > this.epsilon) {
      this.open(fill, remainder, fill.fee - closeFee);
    }
  }

  finish(): Trade[] {
    if (this.cycle) {
      this.trades.push(this.toTrade(this.cycle, "OPEN"));
      this.cycle = null;
    }
    return this.trades;
  }

  private open(fill: Fill, quantity: number, fee: number): void {
    const direction = sideDirection(fill.side);
    this.sequence += 1;
    const cycle: Cycle = {
      direction,
      fills: [],
      openQuantity: 0,
      remainingCost: 0,
      openedQuantity: 0,
      closedQuantity: 0,
      totalOpenCost: 0,
      totalCloseProceeds: 0,
      grossPnl: 0,
      fees: 0,
      openedAt: fill.executedAt,
      lastAt: fill.executedAt,
      hasTime: true,
      warnings: [],
      openFingerprint: fill.fingerprint,
      sequence: this.sequence,
      lots: [],
    };
    this.cycle = cycle;
    this.extend(cycle, fill, quantity, fee);
  }

  private extend(cycle: Cycle, fill: Fill, quantity: number, fee: number): void {
    const notional = fill.price * quantity * fill.multiplier;
    cycle.openQuantity += quantity;
    cycle.openedQuantity += quantity;
    cycle.remainingCost += notional;
    cycle.totalOpenCost += notional;
    cycle.fees += fee;
    cycle.lastAt = fill.executedAt;
    cycle.hasTime = cycle.hasTime && fill.hasTime;
    cycle.lots.push({ fill, quantity, fee });
    cycle.fills.push(tradeFill(fill, "OPEN", quantity, fee));
    if (this.pendingWarning) {
      cycle.warnings.push(this.pendingWarning);
      this.pendingWarning = null;
    }
  }

  private reduce(cycle: Cycle, fill: Fill, quantity: number, fee: number): void {
    if (quantity <= this.epsilon) return;
    if (this.pendingWarning) {
      cycle.warnings.push(this.pendingWarning);
      this.pendingWarning = null;
    }
    const sign = directionSign(cycle.direction);
    const closeNotional = fill.price * quantity * fill.multiplier;

    if (this.method === "FIFO") {
      this.reduceFifo(cycle, fill, quantity, fee);
    } else {
      const avgCostPerUnit = cycle.remainingCost / cycle.openQuantity;
      const closedCost = avgCostPerUnit * quantity;
      cycle.remainingCost -= closedCost;
      cycle.grossPnl += sign * (closeNotional - closedCost);
      cycle.totalCloseProceeds += closeNotional;
      cycle.closedQuantity += quantity;
      cycle.fees += fee;
      cycle.fills.push(tradeFill(fill, "CLOSE", quantity, fee));
    }

    cycle.openQuantity -= quantity;
    cycle.lastAt = fill.executedAt;
    cycle.hasTime = cycle.hasTime && fill.hasTime;

    if (nearlyZero(cycle.openQuantity, this.epsilon)) {
      cycle.openQuantity = 0;
      if (this.method === "AVERAGE_COST") {
        this.trades.push(this.toTrade(cycle, "CLOSED"));
      }
      this.cycle = null;
    }
  }

  private reduceFifo(cycle: Cycle, fill: Fill, quantity: number, fee: number): void {
    const sign = directionSign(cycle.direction);
    let remaining = quantity;
    const consumed: Array<{ lot: Lot; quantity: number; fee: number }> = [];
    while (remaining > this.epsilon && cycle.lots.length > 0) {
      const lot = cycle.lots[0];
      const take = Math.min(lot.quantity, remaining);
      const lotFee = lot.quantity > 0 ? (lot.fee * take) / lot.quantity : 0;
      consumed.push({ lot, quantity: take, fee: lotFee });
      lot.quantity -= take;
      lot.fee -= lotFee;
      remaining -= take;
      if (nearlyZero(lot.quantity, this.epsilon)) cycle.lots.shift();
    }
    const closedQuantity = quantity - remaining;
    if (closedQuantity <= this.epsilon) return;

    const openCost = consumed.reduce((sum, c) => sum + c.lot.fill.price * c.quantity * c.lot.fill.multiplier, 0);
    const openFees = consumed.reduce((sum, c) => sum + c.fee, 0);
    const closeNotional = fill.price * closedQuantity * fill.multiplier;
    const grossPnl = sign * (closeNotional - openCost);
    const openedAt = consumed[0].lot.fill.executedAt;
    const hasTime = consumed.every((c) => c.lot.fill.hasTime) && fill.hasTime;
    const fills: TradeFill[] = [
      ...consumed.map((c) => tradeFill(c.lot.fill, "OPEN", c.quantity, c.fee)),
      tradeFill(fill, "CLOSE", closedQuantity, fee),
    ];
    const template = consumed[0].lot.fill;
    const fees = openFees + fee;
    const netPnl = roundMoney(grossPnl - fees);
    this.fifoCloseIndex += 1;
    this.trades.push({
      tradeKey: hashKey(["FIFO", template.accountId, template.instrumentKey, fill.fingerprint, cycle.direction, this.fifoCloseIndex]),
      accountId: template.accountId,
      instrumentKey: template.instrumentKey,
      symbol: template.symbol,
      description: template.description,
      assetClass: template.assetClass,
      option: template.option,
      direction: cycle.direction,
      status: "CLOSED",
      matchingMethod: "FIFO",
      currency: template.currency,
      multiplier: template.multiplier,
      quantity: closedQuantity,
      openQuantity: 0,
      avgEntryPrice: openCost / (closedQuantity * template.multiplier),
      avgExitPrice: fill.price,
      costBasis: roundMoney(openCost),
      proceeds: roundMoney(closeNotional),
      grossPnl: roundMoney(grossPnl),
      fees: roundMoney(fees),
      netPnl,
      pnlPercent: openCost > 0 ? roundMoney((netPnl / openCost) * 100) : null,
      openedAt,
      closedAt: fill.executedAt,
      hasTime,
      holdingSeconds: Math.max(0, Math.round((fill.executedAt.getTime() - openedAt.getTime()) / 1000)),
      executions: fills.length,
      fills,
      warnings: [...cycle.warnings],
    });
    cycle.warnings = [];
    cycle.closedQuantity += closedQuantity;
    cycle.totalCloseProceeds += closeNotional;
    cycle.remainingCost -= openCost;
    cycle.fees += fee;
  }

  private orphan(fill: Fill, reason: string): void {
    const template = fill;
    this.trades.push({
      tradeKey: hashKey(["ORPHAN", template.accountId, template.instrumentKey, fill.fingerprint]),
      accountId: template.accountId,
      instrumentKey: template.instrumentKey,
      symbol: template.symbol,
      description: template.description,
      assetClass: template.assetClass,
      option: template.option,
      direction: "LONG",
      status: "CLOSED",
      matchingMethod: this.method,
      currency: template.currency,
      multiplier: template.multiplier,
      quantity: fill.quantity,
      openQuantity: 0,
      avgEntryPrice: 0,
      avgExitPrice: 0,
      costBasis: 0,
      proceeds: 0,
      grossPnl: 0,
      fees: 0,
      netPnl: 0,
      pnlPercent: null,
      openedAt: fill.executedAt,
      closedAt: fill.executedAt,
      hasTime: fill.hasTime,
      holdingSeconds: 0,
      executions: 1,
      fills: [tradeFill(fill, "CLOSE", fill.quantity, fill.fee)],
      warnings: [reason],
    });
  }

  private toTrade(cycle: Cycle, status: "OPEN" | "CLOSED"): Trade {
    const source = this.template as Fill;
    const multiplier = source.multiplier;
    const method = this.method;
    const closedAt = status === "CLOSED" ? cycle.lastAt : null;

    if (method === "FIFO") {
      const fills = cycle.lots.map((lot) => tradeFill(lot.fill, "OPEN", lot.quantity, lot.fee));
      const quantity = cycle.lots.reduce((s, l) => s + l.quantity, 0);
      const cost = cycle.lots.reduce((s, l) => s + l.fill.price * l.quantity * l.fill.multiplier, 0);
      const fees = roundMoney(cycle.lots.reduce((s, l) => s + l.fee, 0));
      const openedAt = cycle.lots[0]?.fill.executedAt ?? cycle.openedAt;
      return {
        tradeKey: hashKey([method, source.accountId, source.instrumentKey, cycle.lots[0]?.fill.fingerprint ?? cycle.openFingerprint, cycle.direction, "OPEN"]),
        accountId: source.accountId,
        instrumentKey: source.instrumentKey,
        symbol: source.symbol,
        description: source.description,
        assetClass: source.assetClass,
        option: source.option,
        direction: cycle.direction,
        status: "OPEN",
        matchingMethod: method,
        currency: source.currency,
        multiplier,
        quantity,
        openQuantity: quantity,
        avgEntryPrice: quantity > 0 ? cost / (quantity * multiplier) : 0,
        avgExitPrice: null,
        costBasis: roundMoney(cost),
        proceeds: 0,
        grossPnl: 0,
        fees,
        netPnl: 0,
        pnlPercent: null,
        openedAt,
        closedAt: null,
        hasTime: fills.every((f) => f.hasTime),
        holdingSeconds: null,
        executions: fills.length,
        fills,
        warnings: cycle.warnings,
      };
    }

    const fees = roundMoney(cycle.fees);
    const grossPnl = roundMoney(cycle.grossPnl);
    const netPnl = roundMoney(grossPnl - fees);
    return {
      tradeKey: hashKey([method, source.accountId, source.instrumentKey, cycle.openFingerprint, cycle.direction, cycle.sequence]),
      accountId: source.accountId,
      instrumentKey: source.instrumentKey,
      symbol: source.symbol,
      description: source.description,
      assetClass: source.assetClass,
      option: source.option,
      direction: cycle.direction,
      status,
      matchingMethod: method,
      currency: source.currency,
      multiplier,
      quantity: cycle.openedQuantity,
      openQuantity: cycle.openQuantity,
      avgEntryPrice: cycle.openedQuantity > 0 ? cycle.totalOpenCost / (cycle.openedQuantity * multiplier) : 0,
      avgExitPrice: cycle.closedQuantity > 0 ? cycle.totalCloseProceeds / (cycle.closedQuantity * multiplier) : null,
      costBasis: roundMoney(cycle.totalOpenCost),
      proceeds: roundMoney(cycle.totalCloseProceeds),
      grossPnl,
      fees,
      netPnl,
      pnlPercent: status === "CLOSED" && cycle.totalOpenCost > 0 ? roundMoney((netPnl / cycle.totalOpenCost) * 100) : null,
      openedAt: cycle.openedAt,
      closedAt,
      hasTime: cycle.hasTime,
      holdingSeconds: closedAt ? Math.max(0, Math.round((closedAt.getTime() - cycle.openedAt.getTime()) / 1000)) : null,
      executions: cycle.fills.length,
      fills: cycle.fills,
      warnings: cycle.warnings,
    };
  }
}

function tradeFill(fill: Fill, role: "OPEN" | "CLOSE", quantity: number, fee: number): TradeFill {
  return {
    fillId: fill.id,
    fingerprint: fill.fingerprint,
    role,
    side: fill.side,
    quantity,
    price: fill.price,
    fee,
    executedAt: fill.executedAt,
    hasTime: fill.hasTime,
    kind: fill.kind,
  };
}

export function totalRealized(trades: Trade[]): number {
  return roundMoney(trades.reduce((sum, trade) => sum + trade.netPnl, 0));
}
