import Link from "next/link";
import type { Trade } from "@prisma/client";
import { formatDate, formatDuration, formatPercent, formatPrice, formatQuantity, pnlClass, formatMoney } from "@/lib/format";
import { DirectionPill, StatusPill } from "./ui";

export function TradeTable({
  trades,
  timeZone,
  baseCurrency,
  hideDollars = false,
  linkTo = (trade) => `/trades/${trade.id}`,
  showAccount = false,
  accountNames = {},
}: {
  trades: Trade[];
  timeZone: string;
  baseCurrency: string;
  hideDollars?: boolean;
  linkTo?: ((trade: Trade) => string) | null;
  showAccount?: boolean;
  accountNames?: Record<string, string>;
}) {
  if (trades.length === 0) return <p className="py-8 text-center text-sm text-ink-3">No trades match.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-[760px]">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Entry</th>
            <th className="text-right">Exit</th>
            <th>Opened</th>
            <th>Closed</th>
            <th className="text-right">Held</th>
            <th className="text-right">Net P&amp;L</th>
            <th className="text-right">Gain</th>
            {showAccount ? <th>Account</th> : null}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const symbol = (
              <span className="font-medium">
                {trade.symbol}
                {trade.assetClass === "OPTION" ? <span className="ml-1 pill">Option</span> : null}
                {trade.warnings.length ? (
                  <span className="ml-1 pill border-loss/40 text-loss" title={trade.warnings.join("\n")}>
                    !
                  </span>
                ) : null}
              </span>
            );
            return (
              <tr key={trade.id} className="hover:bg-paper-2">
                <td>{linkTo ? <Link href={linkTo(trade)} className="hover:underline">{symbol}</Link> : symbol}</td>
                <td>
                  <span className="flex items-center gap-1">
                    <DirectionPill direction={trade.direction} />
                    {trade.status === "OPEN" ? <StatusPill status="OPEN" /> : null}
                  </span>
                </td>
                <td className="num text-right">{formatQuantity(trade.quantity)}</td>
                <td className="num text-right">{formatPrice(trade.avgEntryPrice)}</td>
                <td className="num text-right">{formatPrice(trade.avgExitPrice)}</td>
                <td className="whitespace-nowrap text-ink-2">{formatDate(trade.openedAt, timeZone, trade.hasTime)}</td>
                <td className="whitespace-nowrap text-ink-2">{trade.closedAt ? formatDate(trade.closedAt, timeZone, trade.hasTime) : "—"}</td>
                <td className="num text-right text-ink-2">{formatDuration(trade.holdingSeconds)}</td>
                <td className={`num text-right font-medium ${pnlClass(trade.netPnl)}`}>
                  {hideDollars ? "••••" : formatMoney(trade.netPnlBase, baseCurrency, { sign: true })}
                  {!hideDollars && trade.currency !== baseCurrency ? <span className="block text-[11px] font-normal text-ink-3">{formatMoney(trade.netPnl, trade.currency, { sign: true })}</span> : null}
                </td>
                <td className={`num text-right ${pnlClass(trade.pnlPercent)}`}>{formatPercent(trade.pnlPercent, { sign: true })}</td>
                {showAccount ? <td className="text-ink-2">{accountNames[trade.accountId] ?? "—"}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
