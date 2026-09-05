import { Snaptrade, SnaptradeAuth, type AuthMode } from "snaptrade-typescript-sdk";
import type { AccountPosition, AccountUniversalActivity, Balance, Brokerage, BrokerageAuthorization, PaginatedUniversalActivity } from "snaptrade-typescript-sdk";
import type { SnapTradeActivity } from "../engine/normalize.ts";
import { requireEnv, snaptradeAuthMode } from "./env.ts";

export type SnapTradeCredentials = { userId: string; userSecret: string } | { personal: true };

type UserParams = { userId: string; userSecret: string } | { userId?: undefined; userSecret?: undefined };

export const PERSONAL_OWNER_ID = "personal-key-owner";

export function isPersonal(credentials: SnapTradeCredentials): credentials is { personal: true } {
  return "personal" in credentials;
}

function userParams(credentials: SnapTradeCredentials): UserParams {
  if (isPersonal(credentials)) return {};
  return { userId: credentials.userId, userSecret: credentials.userSecret };
}

export type SnapTradeBrokerage = Brokerage;
export type SnapTradeAuthorization = BrokerageAuthorization & { id: string };
export type SnapTradePosition = AccountPosition;
export type SnapTradeBalance = Balance;

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

export type ActivitiesPage = {
  data: SnapTradeActivity[];
  pagination: { offset: number; limit: number; total: number };
};

let cached: Snaptrade<AuthMode> | null = null;

export function snaptrade(): Snaptrade<AuthMode> {
  if (cached) return cached;
  const keys = { clientId: requireEnv("SNAPTRADE_CLIENT_ID"), consumerKey: requireEnv("SNAPTRADE_CONSUMER_KEY") };
  const auth: AuthMode = snaptradeAuthMode() === "personal" ? SnaptradeAuth.personalApiKey(keys) : SnaptradeAuth.commercialApiKey(keys);
  cached = new Snaptrade<AuthMode>({ auth });
  return cached;
}

export async function registerUser(userId: string): Promise<SnapTradeCredentials> {
  if (snaptradeAuthMode() === "personal") return { personal: true };
  const response = await snaptrade().authentication.registerSnapTradeUser({ userId });
  const body = response.data as { userId?: string; userSecret?: string };
  if (!body.userId || !body.userSecret) throw new Error("SnapTrade did not return a userSecret");
  return { userId: body.userId, userSecret: body.userSecret };
}

export async function deleteUser(userId: string): Promise<void> {
  if (snaptradeAuthMode() === "personal") return;
  await snaptrade().authentication.deleteSnapTradeUser({ userId });
}

export async function createPortalUrl(
  credentials: SnapTradeCredentials,
  options: { broker?: string; customRedirect: string; reconnect?: string; immediateRedirect?: boolean },
): Promise<{ redirectURI: string; sessionId?: string }> {
  const response = await snaptrade().authentication.loginSnapTradeUser({
    ...userParams(credentials),
    broker: options.broker,
    immediateRedirect: options.immediateRedirect ?? true,
    customRedirect: options.customRedirect,
    reconnect: options.reconnect,
    connectionType: "read",
    connectionPortalVersion: "v4",
  });
  const body = response.data as { redirectURI?: string; sessionId?: string };
  if (!body.redirectURI) throw new Error("SnapTrade did not return a redirectURI");
  return { redirectURI: body.redirectURI, sessionId: body.sessionId };
}

export async function listAuthorizations(credentials: SnapTradeCredentials): Promise<SnapTradeAuthorization[]> {
  const response = await snaptrade().connections.listBrokerageAuthorizations(userParams(credentials));
  return (response.data ?? []).filter((auth): auth is SnapTradeAuthorization => typeof auth.id === "string");
}

export async function getAuthorization(credentials: SnapTradeCredentials, authorizationId: string): Promise<BrokerageAuthorization> {
  const response = await snaptrade().connections.detailBrokerageAuthorization({ ...userParams(credentials), authorizationId });
  return response.data;
}

export async function removeAuthorization(credentials: SnapTradeCredentials, authorizationId: string): Promise<void> {
  await snaptrade().connections.deleteConnection({ ...userParams(credentials), connectionId: authorizationId });
}

export async function refreshAuthorization(credentials: SnapTradeCredentials, authorizationId: string): Promise<void> {
  await snaptrade().connections.refreshBrokerageAuthorization({ ...userParams(credentials), authorizationId });
}

export async function requestTransactionSync(credentials: SnapTradeCredentials, authorizationId: string): Promise<void> {
  await snaptrade().connections.syncBrokerageAuthorizationTransactions({ ...userParams(credentials), authorizationId });
}

export async function listAccounts(credentials: SnapTradeCredentials): Promise<SnapTradeAccount[]> {
  const response = await snaptrade().accountInformation.listUserAccounts(userParams(credentials));
  return (response.data ?? []) as unknown as SnapTradeAccount[];
}

export async function listPositions(credentials: SnapTradeCredentials, accountId: string): Promise<SnapTradePosition[]> {
  const response = await snaptrade().accountInformation.getAllAccountPositions({ ...userParams(credentials), accountId });
  return response.data?.results ?? [];
}

export async function listBalances(credentials: SnapTradeCredentials, accountId: string): Promise<SnapTradeBalance[]> {
  const response = await snaptrade().accountInformation.getUserAccountBalance({ ...userParams(credentials), accountId });
  return response.data ?? [];
}

export async function listActivitiesPage(
  credentials: SnapTradeCredentials,
  accountId: string,
  options: { startDate?: string; endDate?: string; offset: number; limit: number },
): Promise<ActivitiesPage> {
  const response = await snaptrade().accountInformation.getAccountActivities({
    ...userParams(credentials),
    accountId,
    startDate: options.startDate,
    endDate: options.endDate,
    offset: options.offset,
    limit: options.limit,
  });
  const body: PaginatedUniversalActivity = response.data ?? {};
  const data = (body.data ?? []) as AccountUniversalActivity[];
  return {
    data: data as SnapTradeActivity[],
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
  return response.data ?? [];
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
