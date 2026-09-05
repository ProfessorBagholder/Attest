import Link from "next/link";
import type { Period } from "@/lib/stats";

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1 year" },
  { key: "all", label: "All time" },
];

export function PeriodTabs({ current, basePath, params = {} }: { current: Period; basePath: string; params?: Record<string, string | undefined> }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Period">
      {PERIODS.map((p) => {
        const search = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
        search.set("period", p.key);
        return (
          <Link key={p.key} href={`${basePath}?${search.toString()}`} className="tab" role="tab" aria-current={current === p.key ? "true" : undefined}>
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

export function parsePeriod(value: string | undefined, fallback: Period = "all"): Period {
  return PERIODS.some((p) => p.key === value) ? (value as Period) : fallback;
}
