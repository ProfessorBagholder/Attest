import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { formatDate, formatDuration, formatMoney, formatPercent, formatPrice, formatQuantity, pnlTone } from "@/lib/format";
import { DirectionPill, SectionHeading, StatTile, StatusPill } from "@/components/ui";
import { JournalForm } from "./JournalForm";

export const metadata = { title: "Trade" };

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const trade = await prisma.trade.findFirst({
    where: { id, userId: user.id },
    include: { fills: { orderBy: { executedAt: "asc" }, include: { activity: true } }, tags: { include: { tag: true } }, account: true },
  });
  if (!trade) notFound();
  const currency = trade.currency;
  const option = trade.optionMeta as unknown as { underlying: string; optionType: string; strike: number; expiration: string } | null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/trades" className="text-xs text-ink-3 hover:text-ink">
            ← All trades
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {trade.symbol}
            <DirectionPill direction={trade.direction} />
            <StatusPill status={trade.status} />
            {trade.assetClass === "OPTION" ? <span className="pill">Option</span> : null}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {trade.description ?? trade.instrumentKey}
            {option ? ` · ${option.underlying} ${option.strike} ${option.optionType} exp ${option.expiration}` : ""} · {trade.account.name ?? trade.account.institutionName} ({trade.account.currency})
          </p>
        </div>
        <div className="text-right">
          <div className={`num text-3xl font-semibold ${pnlTone(trade.netPnl) === "gain" ? "text-gain" : pnlTone(trade.netPnl) === "loss" ? "text-loss" : ""}`}>{formatMoney(trade.netPnl, currency, { sign: true })}</div>
          <div className="text-xs text-ink-3">
            {formatPercent(trade.pnlPercent, { sign: true })}
            {trade.currency !== user.baseCurrency ? ` · ${formatMoney(trade.netPnlBase, user.baseCurrency, { sign: true })} at ${trade.fxRateToBase.toFixed(4)}` : ""}
          </div>
        </div>
      </div>

      {trade.warnings.length ? (
        <div className="rounded-xl bg-loss-soft px-4 py-3 text-sm text-loss">
          <p className="font-medium">Review this trade</p>
          <ul className="mt-1 list-disc pl-5">
            {trade.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Quantity" value={formatQuantity(trade.quantity)} sub={trade.status === "OPEN" ? `${formatQuantity(trade.openQuantity)} still open` : `${trade.executions} executions`} />
        <StatTile label="Avg entry" value={formatPrice(trade.avgEntryPrice)} />
        <StatTile label="Avg exit" value={formatPrice(trade.avgExitPrice)} />
        <StatTile label="Gross P&L" value={formatMoney(trade.grossPnl, currency, { sign: true })} tone={pnlTone(trade.grossPnl)} />
        <StatTile label="Fees" value={formatMoney(trade.fees, currency)} />
        <StatTile label="Held" value={formatDuration(trade.holdingSeconds)} sub={`${formatDate(trade.openedAt, user.timeZone, trade.hasTime)}${trade.closedAt ? ` → ${formatDate(trade.closedAt, user.timeZone, trade.hasTime)}` : ""}`} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <SectionHeading title="Executions" description="As reported by the broker. Quantities shown are the portion allocated to this trade." />
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {trade.fills.map((fill) => (
                  <tr key={fill.id}>
                    <td className="whitespace-nowrap text-ink-2">{formatDate(fill.executedAt, user.timeZone, fill.hasTime)}</td>
                    <td>
                      <span className="font-medium">{fill.kind === "TRADE" ? (fill.side === "BUY" ? "Buy" : "Sell") : fill.kind.charAt(0) + fill.kind.slice(1).toLowerCase().replace("_", " ")}</span>
                      <span className="ml-1 text-xs text-ink-3">{fill.role === "OPEN" ? "open" : "close"}</span>
                    </td>
                    <td className="num text-right">{formatQuantity(fill.quantity)}</td>
                    <td className="num text-right">{formatPrice(fill.price)}</td>
                    <td className="num text-right">{formatMoney(fill.price * fill.quantity * trade.multiplier, currency)}</td>
                    <td className="num text-right text-ink-2">{fill.fee ? formatMoney(fill.fee, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Cost basis {formatMoney(trade.costBasis, currency)} · proceeds {formatMoney(trade.proceeds, currency)}
            {trade.multiplier !== 1 ? ` · contract multiplier ${trade.multiplier}` : ""}
          </p>
        </section>

        <section>
          <SectionHeading title="Journal" description="Notes are yours; the numbers above are the broker's." />
          <JournalForm
            tradeId={trade.id}
            initial={{ notes: trade.notes ?? "", setup: trade.setup ?? "", mistakes: trade.mistakes ?? "", rating: trade.rating ?? null, tags: trade.tags.map((t) => t.tag.name).join(", ") }}
          />
        </section>
      </div>
    </div>
  );
}
