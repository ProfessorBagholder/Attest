import type { ReactNode } from "react";

export type MetricRow = { label: string; all: ReactNode; wins?: ReactNode; losses?: ReactNode; hint?: string };

export function MetricTable({ rows, columns = ["All", "Wins", "Losses"], compact = false }: { rows: MetricRow[]; columns?: [string, string, string] | [string]; compact?: boolean }) {
  const split = columns.length === 3;
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th className="w-[46%]"> </th>
            <th className="text-right">{columns[0]}</th>
            {split ? <th className="text-right">{columns[1]}</th> : null}
            {split ? <th className="text-right">{columns[2]}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={compact ? "[&>td]:py-1.5" : ""}>
              <td>
                <div className="text-sm text-ink-2">{row.label}</div>
                {row.hint ? <div className="text-[11px] text-ink-3">{row.hint}</div> : null}
              </td>
              <td className="num text-right font-medium">{row.all}</td>
              {split ? <td className="num text-right text-ink-2">{row.wins ?? "—"}</td> : null}
              {split ? <td className="num text-right text-ink-2">{row.losses ?? "—"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
