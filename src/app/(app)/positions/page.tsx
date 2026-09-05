import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { tradeWhere } from "@/lib/stats";
import { formatMoney, formatPrice, formatQuantity, pnlClass, relativeTime } from "@/lib/format";
import { TradeTable } from "@/components/TradeTable";
import { Empty, SectionHeading } from "@/components/ui";

export const metadata = { title: "Positions" };

export default async function PositionsPage() {
  const user = await requireUser();
  const [positions, openTrades, accounts] = await Promise.all([
    prisma.position.findMany({ where: { account: { userId: user.id } }, include: { account: true }, orderBy: [{ account: { name: "asc" } }, { symbol: "asc" }] }),
    prisma.trade.findMany({ where: { ...tradeWhere(user), status: "OPEN" }, orderBy: { openedAt: "desc" } }),
    prisma.account.findMany({ where: { userId: user.id } }),
  ]);
  const accountNames = Object.fromEntries(accounts.map((a) => [a.id, `${a.name ?? a.institutionName} ${a.currency}`]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Positions</h1>
        <p className="mt-1 text-sm text-ink-3">Holdings as your broker reports them, and the open position cycles built from your executions.</p>
      </div>

      <section>
        <SectionHeading title="Broker holdings" description={positions.length ? `Updated ${relativeTime(positions[0].updatedAt)}` : undefined} />
        {positions.length === 0 ? (
          <Empty title="No holdings reported">Connect and sync an account to see holdings here.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Account</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Avg cost</th>
                  <th className="text-right">Last</th>
                  <th className="text-right">Market value</th>
                  <th className="text-right">Open P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-medium">{p.symbol}</span>
                      {p.description ? <span className="block text-xs text-ink-3">{p.description}</span> : null}
                    </td>
                    <td className="text-ink-2">{accountNames[p.accountId]}</td>
                    <td className="num text-right">{formatQuantity(p.units)}</td>
                    <td className="num text-right">{formatPrice(p.averagePurchasePrice)}</td>
                    <td className="num text-right">{formatPrice(p.price)}</td>
                    <td className="num text-right">{p.price === null ? "—" : formatMoney(p.price * p.units * (p.isOption ? 100 : 1), p.currency)}</td>
                    <td className={`num text-right font-medium ${pnlClass(p.openPnl)}`}>{formatMoney(p.openPnl, p.currency, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Open trades" description="Position cycles that have not returned to flat. Realized P&L shown is from partial exits only; open trades never count toward performance." />
        <TradeTable trades={openTrades} timeZone={user.timeZone} baseCurrency={user.baseCurrency} showAccount={accounts.length > 1} accountNames={accountNames} />
      </section>
    </div>
  );
}
