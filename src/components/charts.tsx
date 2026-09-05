"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Bucket, DailyStat, EquityPoint } from "@/engine/metrics";
import { formatDayKey, formatMoney, formatPercent } from "@/lib/format";

type Tokens = { ink: string; ink2: string; ink3: string; line: string; gain: string; loss: string; paper: string };

function readTokens(): Tokens {
  const css = getComputedStyle(document.documentElement);
  const rgb = (name: string) => `rgb(${css.getPropertyValue(name).trim().split(/\s+/).join(",")})`;
  return { ink: rgb("--ink"), ink2: rgb("--ink-2"), ink3: rgb("--ink-3"), line: rgb("--line"), gain: rgb("--gain"), loss: rgb("--loss"), paper: rgb("--paper") };
}

function useTokens(): Tokens | null {
  const [tokens, setTokens] = useState<Tokens | null>(null);
  useEffect(() => {
    setTokens(readTokens());
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTokens(readTokens());
    media.addEventListener("change", onChange);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onChange);
    };
  }, []);
  return tokens;
}

function TooltipBox({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="card px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-ink-3">{k}</span>
          <span className="num">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function EquityChart({ points, currency, hideDollars = false, height = 220 }: { points: EquityPoint[]; currency: string; hideDollars?: boolean; height?: number }) {
  const tokens = useTokens();
  if (!tokens) return <div style={{ height }} className="card-muted animate-pulse" />;
  if (points.length === 0) return <div style={{ height }} className="card-muted grid place-items-center text-sm text-ink-3">No closed trades yet</div>;
  const data = points.map((p, i) => ({ i, day: p.dayKey, value: p.cumulative, pnl: p.pnl }));
  const last = data[data.length - 1].value;
  const color = last >= 0 ? tokens.gain : tokens.loss;
  return (
    <div style={{ height }} role="img" aria-label={`Accumulated profit over ${points.length} closed trades, currently ${formatMoney(last, currency, { sign: true })}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={tokens.line} strokeDasharray="2 4" />
          <XAxis dataKey="day" tickFormatter={(d: string) => formatDayKey(d, "short")} tick={{ fill: tokens.ink3, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={36} />
          <YAxis
            tickFormatter={(v: number) => (hideDollars ? "" : formatMoney(v, currency, { compact: true, decimals: 0 }))}
            tick={{ fill: tokens.ink3, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={hideDollars ? 8 : 64}
          />
          <ReferenceLine y={0} stroke={tokens.ink3} strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: tokens.ink3, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={formatDayKey(p.day)}
                  rows={[
                    ["Accumulated", hideDollars ? "hidden" : formatMoney(p.value, currency, { sign: true })],
                    ["This trade", hideDollars ? "hidden" : formatMoney(p.pnl, currency, { sign: true })],
                  ]}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#equity-fill)" dot={false} activeDot={{ r: 4, fill: color, stroke: tokens.paper, strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyPnlChart({ daily, currency, hideDollars = false, height = 180 }: { daily: DailyStat[]; currency: string; hideDollars?: boolean; height?: number }) {
  const tokens = useTokens();
  if (!tokens) return <div style={{ height }} className="card-muted animate-pulse" />;
  if (daily.length === 0) return <div style={{ height }} className="card-muted grid place-items-center text-sm text-ink-3">No trading days</div>;
  return (
    <div style={{ height }} role="img" aria-label={`Daily realized profit across ${daily.length} trading days`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={tokens.line} strokeDasharray="2 4" />
          <XAxis dataKey="dayKey" tickFormatter={(d: string) => formatDayKey(d, "short")} tick={{ fill: tokens.ink3, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={36} />
          <YAxis tickFormatter={(v: number) => (hideDollars ? "" : formatMoney(v, currency, { compact: true, decimals: 0 }))} tick={{ fill: tokens.ink3, fontSize: 11 }} axisLine={false} tickLine={false} width={hideDollars ? 8 : 64} />
          <ReferenceLine y={0} stroke={tokens.ink3} />
          <Tooltip
            cursor={{ fill: tokens.line, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as DailyStat;
              return <TooltipBox title={formatDayKey(d.dayKey)} rows={[["Net P&L", hideDollars ? "hidden" : formatMoney(d.netPnl, currency, { sign: true })], ["Trades", `${d.count} (${d.wins}W / ${d.losses}L)`]]} />;
            }}
          />
          <Bar dataKey="netPnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {daily.map((d) => (
              <Cell key={d.dayKey} fill={d.netPnl >= 0 ? tokens.gain : tokens.loss} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BucketChart({ buckets, currency, hideDollars = false, height = 200, metric = "netPnl" }: { buckets: Bucket[]; currency: string; hideDollars?: boolean; height?: number; metric?: "netPnl" | "winRate" | "count" }) {
  const tokens = useTokens();
  if (!tokens) return <div style={{ height }} className="card-muted animate-pulse" />;
  if (buckets.length === 0) return <div style={{ height }} className="card-muted grid place-items-center text-sm text-ink-3">Not enough data</div>;
  const data = buckets.map((b) => ({ ...b, value: metric === "winRate" ? (b.winRate ?? 0) * 100 : metric === "count" ? b.count : b.netPnl }));
  const format = (v: number) => (metric === "winRate" ? formatPercent(v, { decimals: 0 }) : metric === "count" ? String(v) : hideDollars ? "" : formatMoney(v, currency, { compact: true, decimals: 0 }));
  return (
    <div style={{ height }} role="img" aria-label={`${metric === "netPnl" ? "Net P&L" : metric === "winRate" ? "Win rate" : "Trades"} by ${buckets.length} groups`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={tokens.line} strokeDasharray="2 4" />
          <XAxis dataKey="label" tick={{ fill: tokens.ink3, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={format} tick={{ fill: tokens.ink3, fontSize: 11 }} axisLine={false} tickLine={false} width={metric === "netPnl" && hideDollars ? 8 : 56} />
          {metric === "netPnl" ? <ReferenceLine y={0} stroke={tokens.ink3} /> : null}
          <Tooltip
            cursor={{ fill: tokens.line, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as Bucket;
              return (
                <TooltipBox
                  title={b.label}
                  rows={[
                    ["Net P&L", hideDollars ? "hidden" : formatMoney(b.netPnl, currency, { sign: true })],
                    ["Trades", `${b.count} (${b.wins}W / ${b.losses}L)`],
                    ["Win rate", formatPercent(b.winRate, { ratio: true })],
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((b) => (
              <Cell key={b.key} fill={metric === "netPnl" ? (b.netPnl >= 0 ? tokens.gain : tokens.loss) : tokens.ink} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
