import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, formatPercent, pnlClass } from "@/lib/format";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-ink text-paper">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      Attest
    </Link>
  );
}

export function VerifiedBadge({ size = "md", label = "Broker-verified" }: { size?: "sm" | "md" | "lg"; label?: string }) {
  const cls = size === "lg" ? "px-3 py-1 text-sm" : size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-ink font-medium text-paper ${cls}`}>
      <svg viewBox="0 0 24 24" className={size === "lg" ? "h-4 w-4" : "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 13l4 4L19 7" />
      </svg>
      {label}
    </span>
  );
}

export function Stars({ count, size = "md" }: { count: number; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${count} of 3 verification stars`} title={`${count} of 3 verification stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={`${dim} ${i < count ? "text-ink" : "text-line"}`} fill="currentColor" aria-hidden>
          <path d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.3 6.7L12 17.4l-5.9 3.4 1.3-6.7-5-4.6 6.7-.8z" />
        </svg>
      ))}
    </span>
  );
}

export function Money({ value, currency, sign = true, className = "", hidden = false }: { value: number | null | undefined; currency: string; sign?: boolean; className?: string; hidden?: boolean }) {
  if (hidden) return <span className={`num ${className}`}>••••</span>;
  return <span className={`num ${pnlClass(value)} ${className}`}>{formatMoney(value, currency, { sign })}</span>;
}

export function Percent({ value, sign = true, className = "", ratio = false }: { value: number | null | undefined; sign?: boolean; className?: string; ratio?: boolean }) {
  return <span className={`num ${pnlClass(value)} ${className}`}>{formatPercent(value, { sign, ratio })}</span>;
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "gain" | "loss" | "flat" }) {
  const color = tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink";
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`num mt-2 text-2xl font-semibold tracking-tight ${color}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-ink-3">{sub}</div> : null}
    </div>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card-muted flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="text-sm text-ink-3">{children}</div> : null}
    </div>
  );
}

export function DirectionPill({ direction }: { direction: "LONG" | "SHORT" }) {
  return <span className="pill">{direction === "LONG" ? "Long" : "Short"}</span>;
}

export function StatusPill({ status }: { status: "OPEN" | "CLOSED" }) {
  return <span className={status === "OPEN" ? "pill border-ink text-ink" : "pill"}>{status === "OPEN" ? "Open" : "Closed"}</span>;
}
