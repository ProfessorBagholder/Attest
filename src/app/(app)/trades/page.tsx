import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { periodRange, tradeWhere, type TradeFilter } from "@/lib/stats";
import { parsePeriod, PeriodTabs } from "@/components/PeriodTabs";
import { TradeTable } from "@/components/TradeTable";

export const metadata = { title: "Trades" };

const PAGE_SIZE = 50;

type Search = { period?: string; account?: string; symbol?: string; status?: string; direction?: string; asset?: string; page?: string; sort?: string };

export default async function TradesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const period = parsePeriod(params.period, "all");
  const range = periodRange(period, user.timeZone);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const status = params.status === "OPEN" || params.status === "CLOSED" ? params.status : undefined;
  const filter: TradeFilter = {
    accountId: params.account || undefined,
    symbol: params.symbol?.trim() || undefined,
    status,
    direction: params.direction === "LONG" || params.direction === "SHORT" ? params.direction : undefined,
    assetClass: params.asset || undefined,
    from: status === "OPEN" ? undefined : range.from,
    to: status === "OPEN" ? undefined : range.to,
  };
  const where = tradeWhere(user, filter);
  if (!status && (range.from || range.to)) {
    where.OR = [{ status: "OPEN" }, { closeDayKey: where.closeDayKey }];
    delete where.closeDayKey;
  }
  const sort = params.sort === "pnl" ? [{ netPnlBase: "desc" as const }] : params.sort === "pnl-asc" ? [{ netPnlBase: "asc" as const }] : [{ closedAt: { sort: "desc" as const, nulls: "first" as const } }, { openedAt: "desc" as const }];

  const [trades, total, accounts, assetClasses] = await Promise.all([
    prisma.trade.findMany({ where, orderBy: sort, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.trade.count({ where }),
    prisma.account.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.trade.groupBy({ by: ["assetClass"], where: tradeWhere(user), _count: true }),
  ]);
  const accountNames = Object.fromEntries(accounts.map((a) => [a.id, `${a.name ?? a.institutionName} ${a.currency}`]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const carry = { account: params.account, symbol: params.symbol, status: params.status, direction: params.direction, asset: params.asset, sort: params.sort };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trades</h1>
        <p className="mt-1 text-sm text-ink-3">
          {user.matchingMethod === "AVERAGE_COST" ? "One trade per position, from first entry to flat, at average cost." : "One trade per closing execution, matched FIFO against the earliest open lots."}{" "}
          <Link href="/settings#reporting" className="underline">
            Change
          </Link>
        </p>
      </div>

      <PeriodTabs current={period} basePath="/trades" params={carry} />

      <form className="grid grid-cols-2 gap-2 md:grid-cols-6" method="get">
        <input type="hidden" name="period" value={period} />
        <input className="input" name="symbol" placeholder="Symbol" defaultValue={params.symbol ?? ""} aria-label="Symbol" />
        <select className="select" name="account" defaultValue={params.account ?? ""} aria-label="Account">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {accountNames[a.id]}
            </option>
          ))}
        </select>
        <select className="select" name="status" defaultValue={params.status ?? ""} aria-label="Status">
          <option value="">Open + closed</option>
          <option value="CLOSED">Closed</option>
          <option value="OPEN">Open</option>
        </select>
        <select className="select" name="direction" defaultValue={params.direction ?? ""} aria-label="Direction">
          <option value="">Long + short</option>
          <option value="LONG">Long</option>
          <option value="SHORT">Short</option>
        </select>
        <select className="select" name="asset" defaultValue={params.asset ?? ""} aria-label="Asset class">
          <option value="">All assets</option>
          {assetClasses.map((a) => (
            <option key={a.assetClass} value={a.assetClass}>
              {a.assetClass} ({a._count})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select className="select" name="sort" defaultValue={params.sort ?? ""} aria-label="Sort">
            <option value="">Newest first</option>
            <option value="pnl">Biggest gain</option>
            <option value="pnl-asc">Biggest loss</option>
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </div>
      </form>

      <TradeTable trades={trades} timeZone={user.timeZone} baseCurrency={user.baseCurrency} showAccount={accounts.length > 1} accountNames={accountNames} />

      <div className="flex items-center justify-between text-sm text-ink-3">
        <span>
          {total} trade{total === 1 ? "" : "s"}
        </span>
        {pages > 1 ? (
          <span className="flex items-center gap-2">
            {page > 1 ? (
              <Link className="btn-secondary text-xs" href={`/trades?${new URLSearchParams({ ...compact(carry), period, page: String(page - 1) })}`}>
                Previous
              </Link>
            ) : null}
            <span className="num">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Link className="btn-secondary text-xs" href={`/trades?${new URLSearchParams({ ...compact(carry), period, page: String(page + 1) })}`}>
                Next
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function compact(record: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => Boolean(v))) as Record<string, string>;
}
