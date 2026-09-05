const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

export type LocalParts = {
  dayKey: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date: Date, hasTime: boolean, timeZone: string): LocalParts {
  if (!hasTime) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return {
      dayKey: `${year}-${pad(month)}-${pad(day)}`,
      year,
      month,
      day,
      hour: -1,
      minute: -1,
      weekday: date.getUTCDay(),
    };
  }
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    dayKey: `${year}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    hour,
    minute,
    weekday: WEEKDAYS[get("weekday")] ?? date.getUTCDay(),
  };
}

export function dayKey(date: Date, hasTime: boolean, timeZone: string): string {
  return localParts(date, hasTime, timeZone).dayKey;
}

export function monthKey(dayKeyValue: string): string {
  return dayKeyValue.slice(0, 7);
}

export function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function addDays(dayKeyValue: string, days: number): string {
  const [y, m, d] = dayKeyValue.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function todayKey(timeZone: string, now: Date = new Date()): string {
  return localParts(now, true, timeZone).dayKey;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayOfDayKey(dayKeyValue: string): number {
  const [y, m, d] = dayKeyValue.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
