import type { Prisma } from "@prisma/client";
import { prisma } from "./db.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { appUrl } from "./env.ts";
import { loadRateTable, syncFxRates } from "./fx.ts";
import {
  createPortalUrl,
  iterateActivities,
  listAccounts,
  listAuthorizations,
  listPositions,
  registerUser,
  requestTransactionSync,
  resolveWealthsimpleSlug,
  type SnapTradeAccount,
  type SnapTradeAuthorization,
  type SnapTradeCredentials,
} from "./snaptrade.ts";
import { TRADE_ACTIVITY_TYPES, fingerprintActivity, normalizeActivity, type SnapTradeActivity } from "../engine/normalize.ts";
import { matchFills } from "../engine/match.ts";
import { addDays, localParts } from "../engine/time.ts";
import type { Fill, Trade } from "../engine/types.ts";

const OVERLAP_DAYS = 14;

export async function snaptradeCredentials(userId: string): Promise<SnapTradeCredentials | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { snaptradeUserId: true, snaptradeUserSecret: true } });
  if (!user.snaptradeUserId || !user.snaptradeUserSecret) return null;
  return { userId: user.snaptradeUserId, userSecret: decryptSecret(user.snaptradeUserSecret) };
}

export async function ensureSnapTradeUser(userId: string): Promise<SnapTradeCredentials> {
  const existing = await snaptradeCredentials(userId);
  if (existing) return existing;
  const registered = await registerUser(`attest-${userId}`);
  await prisma.user.update({
    where: { id: userId },
    data: { snaptradeUserId: registered.userId, snaptradeUserSecret: encryptSecret(registered.userSecret) },
  });
  return registered;
}

export async function buildPortalUrl(userId: string, options: { reconnectAuthorizationId?: string } = {}): Promise<string> {
  const credentials = await ensureSnapTradeUser(userId);
  const broker = await resolveWealthsimpleSlug();
  const { redirectURI } = await createPortalUrl(credentials, {
    broker,
    customRedirect: `${appUrl()}/connect/callback`,
    reconnect: options.reconnectAuthorizationId,
    immediateRedirect: true,
  });
  return redirectURI;
}

function accountCurrency(account: SnapTradeAccount): string {
  const fromBalance = account.balance?.total?.currency;
  if (fromBalance) return fromBalance.toUpperCase();
  const meta = account.meta ?? {};
  const metaCurrency = (meta.currency ?? meta.base_currency) as string | undefined;
  return (metaCurrency ?? "CAD").toUpperCase();
}

export async function discoverConnections(userId: string): Promise<{ connections: number; accounts: number }> {
  const credentials = await snaptradeCredentials(userId);
  if (!credentials) return { connections: 0, accounts: 0 };

  const authorizations = await listAuthorizations(credentials);
  const seen = new Set<string>();
  for (const auth of authorizations) {
    seen.add(auth.id);
    await upsertConnection(userId, auth);
  }
  await prisma.brokerConnection.updateMany({
    where: { userId, snaptradeAuthorizationId: { notIn: [...seen] }, status: { not: "REMOVED" } },
    data: { status: "REMOVED" },
  });

  const accounts = await listAccounts(credentials);
  let count = 0;
  for (const account of accounts) {
    const connection = await prisma.brokerConnection.findUnique({ where: { snaptradeAuthorizationId: account.brokerage_authorization } });
    if (!connection) continue;
    await prisma.account.upsert({
      where: { snaptradeAccountId: account.id },
      create: {
        userId,
        connectionId: connection.id,
        snaptradeAccountId: account.id,
        name: account.name ?? null,
        number: account.number ?? null,
        institutionName: account.institution_name ?? connection.brokerageName,
        currency: accountCurrency(account),
        rawType: account.raw_type ?? null,
        status: account.status ?? null,
        balanceTotal: account.balance?.total?.amount ?? null,
        balanceCurrency: account.balance?.total?.currency ?? null,
        firstTransactionAt: toDate(account.sync_status?.transactions?.first_transaction_date),
      },
      update: {
        connectionId: connection.id,
        name: account.name ?? null,
        number: account.number ?? null,
        institutionName: account.institution_name ?? connection.brokerageName,
        currency: accountCurrency(account),
        rawType: account.raw_type ?? null,
        status: account.status ?? null,
        balanceTotal: account.balance?.total?.amount ?? null,
        balanceCurrency: account.balance?.total?.currency ?? null,
        firstTransactionAt: toDate(account.sync_status?.transactions?.first_transaction_date),
      },
    });
    count += 1;
  }
  return { connections: authorizations.length, accounts: count };
}

async function upsertConnection(userId: string, auth: SnapTradeAuthorization) {
  const slug = auth.brokerage?.slug ?? "UNKNOWN";
  const name = auth.brokerage?.display_name ?? auth.brokerage?.name ?? slug;
  const status = auth.disabled ? "DISABLED" : "ACTIVE";
  return prisma.brokerConnection.upsert({
    where: { snaptradeAuthorizationId: auth.id },
    create: {
      userId,
      snaptradeAuthorizationId: auth.id,
      brokerageSlug: slug,
      brokerageName: name,
      connectionType: auth.type ?? "read",
      status,
      disabledReason: auth.disabled ? "Connection disabled by brokerage; reconnect required" : null,
    },
    update: {
      brokerageSlug: slug,
      brokerageName: name,
      connectionType: auth.type ?? "read",
      status,
      disabledReason: auth.disabled ? "Connection disabled by brokerage; reconnect required" : null,
    },
  });
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type IngestResult = { fetched: number; inserted: number; updated: number };

export async function ingestActivities(accountDbId: string, activities: SnapTradeActivity[]): Promise<IngestResult> {
  const existing = await prisma.activity.findMany({ where: { accountId: accountDbId }, select: { fingerprint: true } });
  const known = new Set(existing.map((row) => row.fingerprint));
  const creates: Prisma.ActivityCreateManyInput[] = [];
  const touched: string[] = [];
  const now = new Date();
  for (const activity of activities) {
    const fingerprint = fingerprintActivity(accountDbId, activity);
    if (known.has(fingerprint)) {
      touched.push(fingerprint);
      continue;
    }
    known.add(fingerprint);
    creates.push({
      accountId: accountDbId,
      fingerprint,
      externalId: activity.id ?? null,
      externalReferenceId: activity.external_reference_id ?? null,
      type: (activity.type ?? "UNKNOWN").toUpperCase(),
      symbol: activity.symbol?.symbol ?? activity.option_symbol?.underlying_symbol?.symbol ?? null,
      rawSymbol: activity.symbol?.raw_symbol ?? null,
      description: activity.description ?? activity.symbol?.description ?? null,
      securityType: activity.symbol?.type?.code ?? (activity.option_symbol ? "option" : null),
      optionTicker: activity.option_symbol?.ticker ?? null,
      optionType: activity.option_type ?? null,
      units: activity.units ?? null,
      price: activity.price ?? null,
      amount: activity.amount ?? null,
      fee: activity.fee ?? null,
      currency: activity.currency?.code ?? activity.symbol?.currency?.code ?? null,
      fxRate: activity.fx_rate ?? null,
      tradeDate: toDate(activity.trade_date),
      settlementDate: toDate(activity.settlement_date),
      institution: activity.institution ?? null,
      raw: activity as unknown as Prisma.InputJsonValue,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }
  if (creates.length) await prisma.activity.createMany({ data: creates, skipDuplicates: true });
  if (touched.length) {
    await prisma.activity.updateMany({ where: { accountId: accountDbId, fingerprint: { in: touched } }, data: { lastSeenAt: now } });
  }
  return { fetched: activities.length, inserted: creates.length, updated: touched.length };
}

export async function syncPositions(accountDbId: string, credentials: SnapTradeCredentials, snaptradeAccountId: string): Promise<number> {
  const positions = await listPositions(credentials, snaptradeAccountId);
  await prisma.position.deleteMany({ where: { accountId: accountDbId } });
  const rows: Prisma.PositionCreateManyInput[] = [];
  for (const position of positions) {
    const units = toNumber(position.units);
    if (!units) continue;
    const instrument = position.instrument;
    const isOption = instrument.kind === "option";
    const multiplier = isOption ? toNumber(instrument.multiplier) || 100 : 1;
    const price = toNumber(position.price);
    const costBasis = toNumber(position.cost_basis);
    const currency = (position.currency ?? (isOption ? instrument.underlying?.currency : instrument.currency) ?? "CAD").toUpperCase();
    rows.push({
      accountId: accountDbId,
      symbol: instrument.symbol,
      description: instrument.description ?? null,
      securityType: instrument.kind,
      currency,
      units,
      price,
      averagePurchasePrice: costBasis,
      openPnl: price !== null && costBasis !== null ? round((price - costBasis) * units * multiplier) : null,
      isOption,
    });
  }
  if (rows.length) await prisma.position.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

export async function syncAccount(accountDbId: string, trigger: string): Promise<{ runId: string; result: IngestResult; trades: number }> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountDbId }, include: { connection: true, user: true } });
  const run = await prisma.syncRun.create({ data: { userId: account.userId, accountId: account.id, trigger } });
  try {
    const credentials = await snaptradeCredentials(account.userId);
    if (!credentials) throw new Error("User has no SnapTrade credentials");
    const startDate = account.transactionsSyncedAt ? addDays(toDayString(account.transactionsSyncedAt), -OVERLAP_DAYS) : undefined;
    const totals: IngestResult = { fetched: 0, inserted: 0, updated: 0 };
    for await (const page of iterateActivities(credentials, account.snaptradeAccountId, { startDate })) {
      const result = await ingestActivities(account.id, page);
      totals.fetched += result.fetched;
      totals.inserted += result.inserted;
      totals.updated += result.updated;
    }
    await syncPositions(account.id, credentials, account.snaptradeAccountId);
    const now = new Date();
    await prisma.account.update({
      where: { id: account.id },
      data: { transactionsSyncedAt: now, holdingsSyncedAt: now, lastSyncedAt: now },
    });
    await prisma.brokerConnection.update({ where: { id: account.connectionId }, data: { lastSyncedAt: now } });
    const trades = await rebuildTrades(account.userId, account.id);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), activitiesFetched: totals.fetched, activitiesInserted: totals.inserted, tradesBuilt: trades },
    });
    return { runId: run.id, result: totals, trades };
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export async function syncUser(userId: string, trigger: string): Promise<{ accounts: number; errors: string[] }> {
  await discoverConnections(userId);
  const credentials = await snaptradeCredentials(userId);
  if (credentials && (trigger === "manual" || trigger === "cron" || trigger === "cli")) {
    const active = await prisma.brokerConnection.findMany({ where: { userId, status: "ACTIVE", snaptradeAuthorizationId: { not: { startsWith: "demo-" } } } });
    for (const connection of active) await requestTransactionSync(credentials, connection.snaptradeAuthorizationId).catch(() => undefined);
  }
  const accounts = await prisma.account.findMany({ where: { userId, connection: { status: "ACTIVE" } } });
  const errors: string[] = [];
  for (const account of accounts) {
    try {
      await syncAccount(account.id, trigger);
    } catch (error) {
      errors.push(`${account.name ?? account.number ?? account.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { accounts: accounts.length, errors };
}

export async function loadFills(accountDbId: string): Promise<Fill[]> {
  const rows = await prisma.activity.findMany({
    where: { accountId: accountDbId, type: { in: [...TRADE_ACTIVITY_TYPES] } },
    orderBy: [{ tradeDate: "asc" }, { firstSeenAt: "asc" }],
  });
  const fills: Fill[] = [];
  for (const row of rows) {
    const fill = normalizeActivity(accountDbId, row.id, row.raw as unknown as SnapTradeActivity);
    if (fill) fills.push(fill);
  }
  return fills;
}

export async function rebuildTrades(userId: string, accountDbId?: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const accounts = await prisma.account.findMany({ where: accountDbId ? { id: accountDbId, userId } : { userId } });
  let built = 0;
  for (const account of accounts) {
    const fills = await loadFills(account.id);
    const trades = matchFills(fills, { method: user.matchingMethod });
    const currencies = [...new Set(trades.map((t) => t.currency).concat(user.baseCurrency))];
    const firstDay = trades.length ? localParts(trades[0].openedAt, trades[0].hasTime, user.timeZone).dayKey : toDayString(new Date());
    if (currencies.some((c) => c !== "CAD")) await syncFxRates(currencies, firstDay).catch(() => 0);
    const rates = await loadRateTable(currencies, firstDay);
    const keys = new Set<string>();
    for (const trade of trades) {
      keys.add(trade.tradeKey);
      await upsertTrade(user.id, account.id, trade, user.timeZone, user.baseCurrency, rates);
      built += 1;
    }
    await prisma.trade.deleteMany({
      where: { accountId: account.id, matchingMethod: user.matchingMethod, tradeKey: { notIn: [...keys] } },
    });
  }
  return built;
}

async function upsertTrade(
  userId: string,
  accountDbId: string,
  trade: Trade,
  timeZone: string,
  baseCurrency: string,
  rates: Awaited<ReturnType<typeof loadRateTable>>,
): Promise<void> {
  const closeAt = trade.closedAt ?? trade.openedAt;
  const closeDayKey = localParts(closeAt, trade.hasTime, timeZone).dayKey;
  const conversion = rates.convert(1, trade.currency, baseCurrency, closeDayKey);
  const warnings = conversion.exact ? trade.warnings : [...trade.warnings, `No ${trade.currency}/${baseCurrency} rate for ${closeDayKey}; reported unconverted`];
  const rate = conversion.rate;
  const data = {
    userId,
    accountId: accountDbId,
    matchingMethod: trade.matchingMethod,
    instrumentKey: trade.instrumentKey,
    symbol: trade.symbol,
    description: trade.description,
    assetClass: trade.assetClass,
    optionMeta: trade.option ? (trade.option as unknown as Prisma.InputJsonValue) : undefined,
    direction: trade.direction,
    status: trade.status,
    currency: trade.currency,
    multiplier: trade.multiplier,
    quantity: trade.quantity,
    openQuantity: trade.openQuantity,
    avgEntryPrice: trade.avgEntryPrice,
    avgExitPrice: trade.avgExitPrice,
    costBasis: trade.costBasis,
    proceeds: trade.proceeds,
    grossPnl: trade.grossPnl,
    fees: trade.fees,
    netPnl: trade.netPnl,
    pnlPercent: trade.pnlPercent,
    fxRateToBase: rate,
    netPnlBase: round(trade.netPnl * rate),
    grossPnlBase: round(trade.grossPnl * rate),
    feesBase: round(trade.fees * rate),
    costBasisBase: round(trade.costBasis * rate),
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    closeDayKey: trade.status === "CLOSED" ? closeDayKey : null,
    hasTime: trade.hasTime,
    holdingSeconds: trade.holdingSeconds,
    executions: trade.executions,
    warnings,
  };
  const saved = await prisma.trade.upsert({
    where: { tradeKey: trade.tradeKey },
    create: { tradeKey: trade.tradeKey, ...data },
    update: data,
    select: { id: true },
  });
  await prisma.tradeFill.deleteMany({ where: { tradeId: saved.id } });
  await prisma.tradeFill.createMany({
    data: trade.fills.map((fill) => ({
      tradeId: saved.id,
      activityId: fill.fillId,
      role: fill.role,
      side: fill.side,
      kind: fill.kind,
      quantity: fill.quantity,
      price: fill.price,
      fee: fill.fee,
      executedAt: fill.executedAt,
      hasTime: fill.hasTime,
    })),
  });
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
