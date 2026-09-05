import Link from "next/link";
import { currentUser } from "@/lib/auth-next";
import { leaderboard } from "@/lib/stats";
import { formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { PublicNav } from "@/components/Nav";
import { parsePeriod, PeriodTabs } from "@/components/PeriodTabs";
import { Empty, Stars, VerifiedBadge } from "@/components/ui";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [user, params] = await Promise.all([currentUser(), searchParams]);
  const period = parsePeriod(params.period, "30d");
  const entries = await leaderboard(period);

  return (
    <div className="min-h-screen">
      <PublicNav user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
            <p className="mt-1 text-sm text-ink-3">Ranked by realized profit on closed trades, verified by broker import. Only traders who chose to share appear here.</p>
          </div>
          <PeriodTabs current={period} basePath="/leaderboard" />
        </div>

        {entries.length === 0 ? (
          <div className="mt-8">
            <Empty title="Nobody has shared a track record for this period yet">
              {user ? (
                <Link href="/settings#sharing" className="underline">
                  Turn on sharing
                </Link>
              ) : (
                <Link href="/signup" className="underline">
                  Be the first
                </Link>
              )}
            </Empty>
          </div>
        ) : (
          <div className="card mt-6 overflow-x-auto">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Trader</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">Avg gain</th>
                  <th className="text-right">Win rate</th>
                  <th className="text-right">Trades</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.userId} className={user?.id === e.userId ? "bg-paper-2" : ""}>
                    <td className="num text-ink-3">{i + 1}</td>
                    <td>
                      <Link href={`/u/${e.username}`} className="flex items-center gap-2 hover:underline">
                        <span className="font-medium">{e.displayName}</span>
                        <span className="text-xs text-ink-3">@{e.username}</span>
                        <Stars count={e.stars} size="sm" />
                      </Link>
                    </td>
                    <td className={`num text-right font-medium ${e.showDollars ? pnlClass(e.netPnl) : "text-ink-3"}`}>{e.showDollars ? formatMoney(e.netPnl, e.currency, { sign: true }) : "hidden"}</td>
                    <td className={`num text-right ${pnlClass(e.avgPnlPercent)}`}>{formatPercent(e.avgPnlPercent, { sign: true })}</td>
                    <td className="num text-right">{formatPercent(e.winRate, { ratio: true, decimals: 0 })}</td>
                    <td className="num text-right text-ink-2">{e.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-3">
          <VerifiedBadge size="sm" /> Every figure here comes from a read-only brokerage connection. Traders can hide dollar amounts, but cannot alter trades.
        </p>
      </main>
    </div>
  );
}
