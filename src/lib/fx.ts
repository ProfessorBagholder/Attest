import { prisma } from "./db.ts";
import { addDays, todayKey } from "../engine/time.ts";

const VALET_BASE = "https://www.bankofcanada.ca/valet/observations";

type Observation = { d: string } & Record<string, { v?: string } | string>;

export function seriesFor(currency: string): string {
  return `FX${currency.toUpperCase()}CAD`;
}

export async function fetchBankOfCanadaRates(currency: string, startDate: string, endDate?: string): Promise<Array<{ date: string; rate: number }>> {
  const series = seriesFor(currency);
  const params = new URLSearchParams({ start_date: startDate });
  if (endDate) params.set("end_date", endDate);
  const response = await fetch(`${VALET_BASE}/${series}/json?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Bank of Canada Valet responded ${response.status}`);
  const body = (await response.json()) as { observations?: Observation[] };
  const out: Array<{ date: string; rate: number }> = [];
  for (const obs of body.observations ?? []) {
    const cell = obs[series];
    const value = typeof cell === "string" ? cell : cell?.v;
    const rate = Number(value);
    if (obs.d && Number.isFinite(rate) && rate > 0) out.push({ date: obs.d, rate });
  }
  return out;
}

export async function syncFxRates(currencies: string[], fromDay: string): Promise<number> {
  let inserted = 0;
  for (const currency of new Set(currencies.map((c) => c.toUpperCase()))) {
    if (currency === "CAD") continue;
    const latest = await prisma.fxRate.findFirst({ where: { base: currency, quote: "CAD" }, orderBy: { date: "desc" } });
    const start = latest ? addDays(latest.date.toISOString().slice(0, 10), -3) : fromDay;
    let rates: Array<{ date: string; rate: number }>;
    try {
      rates = await fetchBankOfCanadaRates(currency, start);
    } catch {
      continue;
    }
    for (const { date, rate } of rates) {
      await prisma.fxRate.upsert({
        where: { base_quote_date: { base: currency, quote: "CAD", date: new Date(`${date}T00:00:00.000Z`) } },
        create: { base: currency, quote: "CAD", date: new Date(`${date}T00:00:00.000Z`), rate },
        update: { rate },
      });
      inserted += 1;
    }
  }
  return inserted;
}

export type RateTable = {
  toCad(currency: string, dayKey: string): number | null;
  convert(amount: number, from: string, to: string, dayKey: string): { value: number; rate: number; exact: boolean };
};

export async function loadRateTable(currencies: string[], fromDay: string, toDay = todayKey("UTC")): Promise<RateTable> {
  const wanted = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== "CAD"))];
  const rows = wanted.length
    ? await prisma.fxRate.findMany({
        where: { base: { in: wanted }, quote: "CAD", date: { gte: new Date(`${addDays(fromDay, -10)}T00:00:00.000Z`), lte: new Date(`${toDay}T00:00:00.000Z`) } },
        orderBy: { date: "asc" },
      })
    : [];
  const series = new Map<string, Array<{ day: string; rate: number }>>();
  for (const row of rows) {
    const list = series.get(row.base) ?? [];
    list.push({ day: row.date.toISOString().slice(0, 10), rate: row.rate });
    series.set(row.base, list);
  }
  const fallbacks: Record<string, number> = {};
  const usd = Number(process.env.FX_FALLBACK_USDCAD);
  if (Number.isFinite(usd) && usd > 0) fallbacks.USD = usd;

  const toCad = (currency: string, dayKey: string): number | null => {
    const code = currency.toUpperCase();
    if (code === "CAD") return 1;
    const list = series.get(code);
    if (list && list.length) {
      let best: number | null = null;
      for (const point of list) {
        if (point.day <= dayKey) best = point.rate;
        else break;
      }
      if (best !== null) return best;
      return list[0].rate;
    }
    return fallbacks[code] ?? null;
  };

  return {
    toCad,
    convert(amount, from, to, dayKey) {
      const f = from.toUpperCase();
      const t = to.toUpperCase();
      if (f === t) return { value: amount, rate: 1, exact: true };
      const fromCad = toCad(f, dayKey);
      const toCadRate = toCad(t, dayKey);
      if (fromCad === null || toCadRate === null) return { value: amount, rate: 1, exact: false };
      const rate = fromCad / toCadRate;
      return { value: amount * rate, rate, exact: true };
    },
  };
}
