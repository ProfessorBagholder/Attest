import * as Sdk from "snaptrade-typescript-sdk";
import type { SnapTradeActivity } from "../engine/normalize.ts";
import { requireEnv } from "./env.ts";

export type SnapTradeCredentials = { userId: string; userSecret: string };

export type SnapTradeBrokerage = {
  id?: string;
  slug?: string;
  name?: string;
  display_name?: string;
  enabled?: boolean;
  maintenance_mode?: boolean;
  allows_trading?: boolean;
};

export type SnapTradeAuthorization = {
  id: string;
  created_date?: string | null;
  updated_date?: string | null;
  name?: string | null;
  type?: string | null;
  disabled?: boolean | null;
  disabled_date?: string | null;
  brokerage?: SnapTradeBrokerage | null;
  meta?: Record<string, unknown> | null;
};

export type SnapTradeAccount = {
  id: string;
  brokerage_authorization: string;
  name?: string | null;
  number?: string | null;
  institution_name?: string | null;
  created_date?: string | null;
  status?: string | null;
  raw_type?: string | null;
  balance?: { total?: { amount?: number | null; currency?: string | null } | null } | null;
  sync_status?: {
    holdings?: { initial_sync_completed?: boolean; last_successful_sync?: string | null } | null;
    transactions?: { initial_sync_completed?: boolean; last_successful_sync?: string | null; first_transaction_date?: string | null } | null;
  } | null;
  meta?: Record<string, unknown> | null;
};

export type SnapTradePosition = {
  symbol?: {
    symbol?: {
      symbol?: string | null;
      raw_symbol?: string | null;
      description?: string | null;
      currency?: { code?: string | null } | null;
      type?: { code?: string | null; description?: string | null } | null;
    } | null;
    option_symbol?: { ticker?: string | null } | null;
  } | null;
  units?: number | null;
  price?: number | null;
  open_pnl?: number | null;
  average_purchase_price?: number | null;
  currency?: { code?: string | null } | null;
};

export type SnapTradeBalance = {
  currency?: { code?: string | null } | null;
  cash?: number | null;
  buying_power?: number | null;
};

export type ActivitiesPage = {
  data: SnapTradeActivity[];
  pagination: { offset: number; limit: number; total: number };
};

type SdkModule = typeof Sdk & {
  SnaptradeAuth?: { commercialApiKey(input: { consumerKey: string; clientId: string }): unknown };
};

let cached: Sdk.Snaptrade | null = null;

export function snaptrade(): Sdk.Snaptrade {
  if (cached) return cached;
  const clientId = requireEnv("SNAPTRADE_CLIENT_ID");
  const consumerKey = requireEnv("SNAPTRADE_CONSUMER_KEY");
  const mod = Sdk as SdkModule;
  const Ctor = Sdk.Snaptrade as unknown as new (config: Record<string, unknown>) => Sdk.Snaptrade;
  cached = mod.SnaptradeAuth
    ? new Ctor({ auth: mod.SnaptradeAuth.commercialApiKey({ consumerKey, clientId }) })
    : new Ctor({ consumerKey, clientId });
  return cached;
}

function unwrap<T>(response: unknown): T {
  const body = (response as { data?: unknown })?.data;
  return (body === undefined ? response : body) as T;
}

export async function registerUser(userId: string): Promise<SnapTradeCredentials> {
  const response = await snaptrade().authentication.registerSnapTradeUser({ userId });
  const body = unwrap<{ userId: string; userSecret: string }>(response);
  if (!body.userSecret) throw new Error("SnapTrade did not return a userSecret");
  return { userId: body.userId, userSecret: body.userSecret };
}

export async function deleteUser(userId: string): Promise<void> {
  await snaptrade().authentication.deleteSnapTradeUser({ userId });
}

export async function createPortalUrl(
  credentials: SnapTradeCredentials,
  options: { broker?: string; customRedirect: string; reconnect?: string; immediateRedirect?: boolean },
): Promise<{ redirectURI: string; sessionId?: string }> {
  const response = await snaptrade().authentication.loginSnapTradeUser({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
    broker: options.broker,
    immediateRedirect: options.immediateRedirect ?? true,
    customRedirect: options.customRedirect,
    reconnect: options.reconnect,
    connectionType: "read",
    connectionPortalVersion: "v4",
  });
  const body = unwrap<{ redirectURI?: string; sessionId?: string }>(response);
  if (!body.redirectURI) throw new Error("SnapTrade did not return a redirectURI");
  return { redirectURI: body.redirectURI, sessionId: body.sessionId };
}

export async function listAuthorizations(credentials: SnapTradeCredentials): Promise<SnapTradeAuthorization[]> {
  const response = await snaptrade().connections.listBrokerageAuthorizations(credentials);
  return unwrap<SnapTradeAuthorization[]>(response) ?? [];
}

export async function getAuthorization(credentials: SnapTradeCredentials, authorizationId: string): Promise<SnapTradeAuthorization> {
  const response = await snaptrade().connections.detailBrokerageAuthorization({ ...credentials, authorizationId });
  return unwrap<SnapTradeAuthorization>(response);
}

export async function removeAuthorization(credentials: SnapTradeCredentials, authorizationId: string): Promise<void> {
  await snaptrade().connections.removeBrokerageAuthorization({ ...credentials, authorizationId });
}

export async function refreshAuthorization(credentials: SnapTradeCredentials, authorizationId: string): Promise<void> {
  await snaptrade().connections.refreshBrokerageAuthorization({ ...credentials, authorizationId });
}

export async function listAccounts(credentials: SnapTradeCredentials): Promise<SnapTradeAccount[]> {
  const response = await snaptrade().accountInformation.listUserAccounts(credentials);
  return unwrap<SnapTradeAccount[]>(response) ?? [];
}

export async function listPositions(credentials: SnapTradeCredentials, accountId: string): Promise<SnapTradePosition[]> {
  const response = await snaptrade().accountInformation.getUserAccountPositions({ ...credentials, accountId });
  return unwrap<SnapTradePosition[]>(response) ?? [];
}

export async function listBalances(credentials: SnapTradeCredentials, accountId: string): Promise<SnapTradeBalance[]> {
  const response = await snaptrade().accountInformation.getUserAccountBalance({ ...credentials, accountId });
  return unwrap<SnapTradeBalance[]>(response) ?? [];
}

export async function listActivitiesPage(
  credentials: SnapTradeCredentials,
  accountId: string,
  options: { startDate?: string; endDate?: string; offset: number; limit: number },
): Promise<ActivitiesPage> {
  const response = await snaptrade().accountInformation.getAccountActivities({
    ...credentials,
    accountId,
    startDate: options.startDate,
    endDate: options.endDate,
    offset: options.offset,
    limit: options.limit,
  });
  const body = unwrap<{ data?: SnapTradeActivity[]; pagination?: { offset?: number; limit?: number; total?: number } } | SnapTradeActivity[]>(response);
  if (Array.isArray(body)) {
    return { data: body, pagination: { offset: options.offset, limit: options.limit, total: options.offset + body.length } };
  }
  const data = body.data ?? [];
  return {
    data,
    pagination: {
      offset: body.pagination?.offset ?? options.offset,
      limit: body.pagination?.limit ?? options.limit,
      total: body.pagination?.total ?? options.offset + data.length,
    },
  };
}

export async function* iterateActivities(
  credentials: SnapTradeCredentials,
  accountId: string,
  options: { startDate?: string; endDate?: string; pageSize?: number } = {},
): AsyncGenerator<SnapTradeActivity[]> {
  const limit = options.pageSize ?? 1000;
  let offset = 0;
  for (;;) {
    const page = await listActivitiesPage(credentials, accountId, { startDate: options.startDate, endDate: options.endDate, offset, limit });
    if (page.data.length === 0) return;
    yield page.data;
    offset += page.data.length;
    if (offset >= page.pagination.total) return;
  }
}

export async function listBrokerages(): Promise<SnapTradeBrokerage[]> {
  const response = await snaptrade().referenceData.listAllBrokerages();
  return unwrap<SnapTradeBrokerage[]>(response) ?? [];
}

let wealthsimpleSlug: string | null = null;

export async function resolveWealthsimpleSlug(): Promise<string> {
  const pinned = process.env.SNAPTRADE_WEALTHSIMPLE_SLUG;
  if (pinned) return pinned;
  if (wealthsimpleSlug) return wealthsimpleSlug;
  const brokerages = await listBrokerages();
  const match = brokerages.find((b) => `${b.slug ?? ""} ${b.name ?? ""} ${b.display_name ?? ""}`.toLowerCase().includes("wealthsimple"));
  if (!match?.slug) throw new Error("Wealthsimple was not found in SnapTrade's brokerage list; set SNAPTRADE_WEALTHSIMPLE_SLUG");
  wealthsimpleSlug = match.slug;
  return match.slug;
}
