export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function defaultTimeZone(): string {
  return process.env.DEFAULT_TIMEZONE || "America/Toronto";
}

export function defaultBaseCurrency(): string {
  return (process.env.DEFAULT_BASE_CURRENCY || "CAD").toUpperCase();
}

export function snaptradeConfigured(): boolean {
  return Boolean(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY);
}
