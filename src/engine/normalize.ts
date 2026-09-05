import { createHash } from "node:crypto";
import type { AssetClass, Fill, FillKind, OptionMeta, Side } from "./types.ts";

export type SnapTradeSymbol = {
  id?: string;
  symbol?: string | null;
  raw_symbol?: string | null;
  description?: string | null;
  currency?: { code?: string | null } | null;
  exchange?: { code?: string | null; mic_code?: string | null; timezone?: string | null } | null;
  type?: { code?: string | null; description?: string | null } | null;
  figi_code?: string | null;
};

export type SnapTradeOptionSymbol = {
  id?: string;
  ticker?: string | null;
  option_type?: string | null;
  strike_price?: number | null;
  expiration_date?: string | null;
  is_mini_option?: boolean | null;
  underlying_symbol?: SnapTradeSymbol | null;
};

export type SnapTradeActivity = {
  id?: string | null;
  symbol?: SnapTradeSymbol | null;
  option_symbol?: SnapTradeOptionSymbol | null;
  price?: number | null;
  units?: number | null;
  amount?: number | null;
  currency?: { code?: string | null } | null;
  type?: string | null;
  option_type?: string | null;
  description?: string | null;
  trade_date?: string | null;
  settlement_date?: string | null;
  fee?: number | null;
  fx_rate?: number | null;
  institution?: string | null;
  external_reference_id?: string | null;
};

export const TRADE_ACTIVITY_TYPES = new Set([
  "BUY",
  "SELL",
  "OPTIONEXPIRATION",
  "OPTIONASSIGNMENT",
  "OPTIONEXERCISE",
  "EXTERNAL_ASSET_TRANSFER_IN",
  "EXTERNAL_ASSET_TRANSFER_OUT",
]);

export const CASH_ACTIVITY_TYPES = new Set([
  "DIVIDEND",
  "SUBSTITUTE_DIVIDEND",
  "STOCK_DIVIDEND",
  "CONTRIBUTION",
  "WITHDRAWAL",
  "REI",
  "INTEREST",
  "FEE",
  "TAX",
  "TRANSFER",
  "SPLIT",
  "ADJUSTMENT",
]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_UTC = /T00:00:00(?:\.0+)?(?:Z|\+00:?00)$/;

export function parseActivityDate(value: string | null | undefined): { date: Date; hasTime: boolean } | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    return { date: new Date(`${trimmed}T00:00:00.000Z`), hasTime: false };
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return { date, hasTime: !MIDNIGHT_UTC.test(trimmed) };
}

export function classifyAsset(activity: SnapTradeActivity): AssetClass {
  if (activity.option_symbol) return "OPTION";
  const code = (activity.symbol?.type?.code ?? "").toLowerCase();
  if (code === "crypto") return "CRYPTO";
  if (code === "et" || code === "cef") return "ETF";
  if (code === "oef" || code === "mf") return "FUND";
  if (code === "cs" || code === "ad" || code === "ps") return "EQUITY";
  const description = (activity.symbol?.type?.description ?? "").toLowerCase();
  if (description.includes("etf")) return "ETF";
  if (description.includes("crypto")) return "CRYPTO";
  if (description.includes("fund")) return "FUND";
  if (description.includes("stock") || description.includes("equity")) return "EQUITY";
  return "OTHER";
}

export function activityCurrency(activity: SnapTradeActivity): string {
  return (
    activity.currency?.code ??
    activity.symbol?.currency?.code ??
    activity.option_symbol?.underlying_symbol?.currency?.code ??
    "USD"
  ).toUpperCase();
}

export function optionMeta(activity: SnapTradeActivity): OptionMeta | null {
  const option = activity.option_symbol;
  if (!option) return null;
  const type = (option.option_type ?? "").toUpperCase() === "PUT" ? "PUT" : "CALL";
  return {
    underlying: option.underlying_symbol?.symbol ?? option.underlying_symbol?.raw_symbol ?? "",
    optionType: type,
    strike: Number(option.strike_price ?? 0),
    expiration: option.expiration_date ?? "",
  };
}

export function displaySymbol(activity: SnapTradeActivity): string {
  if (activity.option_symbol) {
    const meta = optionMeta(activity);
    if (meta && meta.underlying) {
      return `${meta.underlying} ${meta.expiration} ${meta.strike}${meta.optionType === "CALL" ? "C" : "P"}`;
    }
    return activity.option_symbol.ticker ?? "OPTION";
  }
  return activity.symbol?.symbol ?? activity.symbol?.raw_symbol ?? "UNKNOWN";
}

export function instrumentKey(activity: SnapTradeActivity): string {
  const currency = activityCurrency(activity);
  if (activity.option_symbol) {
    const ticker = (activity.option_symbol.ticker ?? displaySymbol(activity)).replace(/\s+/g, " ").trim();
    return `OPT:${ticker}:${currency}`;
  }
  const symbol = activity.symbol?.symbol ?? activity.symbol?.raw_symbol ?? "UNKNOWN";
  return `EQ:${symbol}:${currency}`;
}

export function fingerprintActivity(accountId: string, activity: SnapTradeActivity): string {
  const parts = [
    accountId,
    (activity.type ?? "").toUpperCase(),
    activity.trade_date ?? "",
    activity.settlement_date ?? "",
    activity.symbol?.symbol ?? activity.symbol?.raw_symbol ?? "",
    activity.option_symbol?.ticker ?? "",
    numberKey(activity.units),
    numberKey(activity.price),
    numberKey(activity.amount),
    activityCurrency(activity),
    (activity.description ?? "").trim(),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function numberKey(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return Number(value).toFixed(8);
}

function fillKind(type: string): FillKind | null {
  switch (type) {
    case "BUY":
    case "SELL":
      return "TRADE";
    case "OPTIONEXPIRATION":
      return "EXPIRATION";
    case "OPTIONASSIGNMENT":
      return "ASSIGNMENT";
    case "OPTIONEXERCISE":
      return "EXERCISE";
    case "EXTERNAL_ASSET_TRANSFER_IN":
      return "TRANSFER_IN";
    case "EXTERNAL_ASSET_TRANSFER_OUT":
      return "TRANSFER_OUT";
    default:
      return null;
  }
}

export function normalizeActivity(
  accountId: string,
  fillId: string,
  activity: SnapTradeActivity,
  positionSideHint?: Side,
): Fill | null {
  const type = (activity.type ?? "").toUpperCase();
  const kind = fillKind(type);
  if (!kind) return null;
  const parsed = parseActivityDate(activity.trade_date ?? activity.settlement_date);
  if (!parsed) return null;

  const rawUnits = Math.abs(Number(activity.units ?? 0));
  if (rawUnits === 0) return null;

  const isOption = Boolean(activity.option_symbol);
  const price = Math.abs(Number(activity.price ?? 0));
  const optionSide = (activity.option_type ?? "").toUpperCase();

  let side: Side;
  let priceUnknown = false;
  switch (kind) {
    case "TRADE":
      side = type === "BUY" ? "BUY" : "SELL";
      break;
    case "TRANSFER_IN":
      side = "BUY";
      priceUnknown = price === 0;
      break;
    case "TRANSFER_OUT":
      side = "SELL";
      priceUnknown = price === 0;
      break;
    default:
      side = positionSideHint === "SELL" ? "BUY" : "SELL";
      if (optionSide.startsWith("BUY")) side = "BUY";
      if (optionSide.startsWith("SELL")) side = "SELL";
      break;
  }

  const settled = parseActivityDate(activity.settlement_date);

  return {
    id: fillId,
    fingerprint: fingerprintActivity(accountId, activity),
    accountId,
    instrumentKey: instrumentKey(activity),
    symbol: displaySymbol(activity),
    description: activity.symbol?.description ?? activity.option_symbol?.underlying_symbol?.description ?? activity.description ?? null,
    assetClass: classifyAsset(activity),
    kind,
    side,
    quantity: rawUnits,
    price: kind === "EXPIRATION" ? 0 : price,
    fee: Math.abs(Number(activity.fee ?? 0)),
    multiplier: isOption && !activity.option_symbol?.is_mini_option ? 100 : isOption ? 10 : 1,
    currency: activityCurrency(activity),
    fxRate: activity.fx_rate ?? null,
    executedAt: parsed.date,
    hasTime: parsed.hasTime,
    settledAt: settled?.date ?? null,
    option: optionMeta(activity),
    priceUnknown,
  };
}
