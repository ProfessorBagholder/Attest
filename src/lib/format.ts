export function formatMoney(value: number | null | undefined, currency = "CAD", options: { sign?: boolean; compact?: boolean; decimals?: number } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const decimals = options.decimals ?? (Math.abs(value) >= 10000 && options.compact ? 0 : 2);
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  if (value < 0) return `−${formatted}`;
  if (options.sign && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return value === Number.POSITIVE_INFINITY ? "∞" : "—";
  return new Intl.NumberFormat("en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 6 }).format(value);
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const decimals = Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: decimals }).format(value);
}

export function formatPercent(value: number | null | undefined, options: { sign?: boolean; decimals?: number; ratio?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const pct = options.ratio ? value * 100 : value;
  const decimals = options.decimals ?? (Math.abs(pct) >= 100 ? 0 : 1);
  const text = `${Math.abs(pct).toFixed(decimals)}%`;
  if (pct < 0) return `−${text}`;
  if (options.sign && pct > 0) return `+${text}`;
  return text;
}

export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === Number.POSITIVE_INFINITY) return "∞";
  return value.toFixed(2);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const days = seconds / 86400;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)}d`;
  if (days < 365) return `${(days / 30.44).toFixed(1)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
}

export function formatDate(date: Date | string | null | undefined, timeZone: string, hasTime = true): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (!hasTime) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(value);
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}

export function formatDayKey(dayKey: string, style: "long" | "short" | "monthYear" = "long"): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d || 1));
  if (style === "monthYear") return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
  if (style === "short") return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }).format(date);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

export function pnlTone(value: number | null | undefined): "gain" | "loss" | "flat" {
  if (value === null || value === undefined || Math.abs(value) < 1e-9) return "flat";
  return value > 0 ? "gain" : "loss";
}

export function pnlClass(value: number | null | undefined): string {
  const tone = pnlTone(value);
  return tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink-2";
}

export function relativeTime(date: Date | null | undefined): string {
  if (!date) return "never";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
