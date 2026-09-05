export type AssetClass = "EQUITY" | "ETF" | "OPTION" | "CRYPTO" | "FUND" | "OTHER";
export type Side = "BUY" | "SELL";
export type Direction = "LONG" | "SHORT";
export type MatchingMethod = "AVERAGE_COST" | "FIFO";
export type FillKind = "TRADE" | "EXPIRATION" | "ASSIGNMENT" | "EXERCISE" | "TRANSFER_IN" | "TRANSFER_OUT";

export type OptionMeta = {
  underlying: string;
  optionType: "CALL" | "PUT";
  strike: number;
  expiration: string;
};

export type Fill = {
  id: string;
  fingerprint: string;
  accountId: string;
  instrumentKey: string;
  symbol: string;
  description: string | null;
  assetClass: AssetClass;
  kind: FillKind;
  side: Side;
  quantity: number;
  price: number;
  fee: number;
  multiplier: number;
  currency: string;
  fxRate: number | null;
  executedAt: Date;
  hasTime: boolean;
  settledAt: Date | null;
  option: OptionMeta | null;
  priceUnknown: boolean;
};

export type FillRole = "OPEN" | "CLOSE";

export type TradeFill = {
  fillId: string;
  fingerprint: string;
  role: FillRole;
  side: Side;
  quantity: number;
  price: number;
  fee: number;
  executedAt: Date;
  hasTime: boolean;
  kind: FillKind;
};

export type Trade = {
  tradeKey: string;
  accountId: string;
  instrumentKey: string;
  symbol: string;
  description: string | null;
  assetClass: AssetClass;
  option: OptionMeta | null;
  direction: Direction;
  status: "OPEN" | "CLOSED";
  matchingMethod: MatchingMethod;
  currency: string;
  multiplier: number;
  quantity: number;
  openQuantity: number;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  costBasis: number;
  proceeds: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  pnlPercent: number | null;
  openedAt: Date;
  closedAt: Date | null;
  hasTime: boolean;
  holdingSeconds: number | null;
  executions: number;
  fills: TradeFill[];
  warnings: string[];
};

export type MatchOptions = {
  method: MatchingMethod;
  quantityEpsilon?: number;
};
