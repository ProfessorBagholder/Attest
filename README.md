# Attest — verified trading performance

A Kinfo-style web app: broker-verified trading journal, analytics and public trader verification. Trades import straight from **Wealthsimple** through **SnapTrade** with a read-only connection. Nothing can be typed in, edited or deleted, so the journal, the statistics and the public profile are a record other people can trust.

Stack: Next.js 15 (App Router, server actions), TypeScript, Tailwind, Prisma + PostgreSQL, Recharts, `snaptrade-typescript-sdk`. Node ≥ 22.6 (the engine's tests and the CLI scripts run on Node's built-in TypeScript type stripping — no test framework or ts-node to install).

---

## Quick start

```bash
cp .env.example .env
# fill in APP_ENCRYPTION_KEY (node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
# fill in SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY when you have them

docker compose up -d          # PostgreSQL 16 on localhost:5432
npm install
npx prisma migrate dev --name init
npm run seed:demo             # optional: four demo traders with 9 months of Wealthsimple-shaped activity
npm run dev                   # http://localhost:3000
```

Demo logins (after `seed:demo`): `demo@attest.local`, `maple@attest.local`, `quiet@attest.local`, `tilt@attest.local` — password `demo-password-123`. The demo goes through the exact same ingestion and trade-building code path as a live SnapTrade sync; only the activity payloads are synthetic.

Other scripts: `npm test` (engine tests), `npm run typecheck`, `npm run sync` (sync every connected user from the CLI), `npm run db:studio`.

---

## What's in the box

| Area | Where | Notes |
|---|---|---|
| Landing, login, signup | `src/app/page.tsx`, `src/app/(auth)` | Email + password, scrypt hashes, httpOnly session cookie (30 days). No real name required; username is the public identity. |
| Overview | `/dashboard` | Verified badge, verification stars, headline metrics (profit, win rate, avg gain $, avg gain %), accumulated profit curve, month calendar preview, edge summary, latest trades. |
| Journal | `/journal?month=YYYY-MM&day=YYYY-MM-DD` | Kinfo-style monthly calendar (Monday-first, weekly totals), month statistics in a row-per-metric table with Wins / Losses columns, daily P&L bars, drill into a day. |
| Trades | `/trades`, `/trades/[id]` | Filter by period / account / symbol / status / direction / asset class; trade detail with every execution and the portion allocated to the trade; journal notes, setup, mistakes, tags, 1–5 execution rating. |
| Analytics | `/analytics?period=…&account=…` | Gain/loss, long/short, timing, holding-period, weekday, entry-hour, best/worst trades, symbols by trades and by volume, monthly bars, drawdown, streaks, expectancy, payoff and profit factor. |
| Positions | `/positions` | Broker holdings snapshot (units, avg cost, last, open P&L) and open position cycles. |
| Accounts | `/accounts` | Connect Wealthsimple (SnapTrade portal), reconnect a disabled connection, sync now, "Refresh from broker", disconnect, sync log. |
| Settings | `/settings` | Profile, sharing (public profile, show dollars, protect open positions), reporting (matching method, reporting currency, time zone). Changing reporting rebuilds trades. |
| Public profile | `/u/[username]` | Broker-verified badge, stars with the three windows explained, headline stats, equity curve, calendar, latest trades. Respects "percent only" and "hide open trades". |
| Leaderboard | `/leaderboard?period=…` | Public traders ranked by realized net P&L for the period; shows stars, avg gain %, win rate, trade count. |
| API | `POST /api/snaptrade/portal`, `POST /api/sync`, `GET /api/cron/sync`, `POST /api/webhooks/snaptrade`, `GET /connect/callback` | See "Sync" below. |

---

## How data flows

```
SnapTrade  ──activities (paged)──▶  Activity (immutable, deduped by fingerprint)
           ──positions──────────▶  Position (snapshot)
Activity  ──normalize──▶ Fill ──match (avg cost | FIFO)──▶ Trade + TradeFill
Trade     ──FX on close date──▶ *Base columns ──▶ stats / calendar / stars / leaderboard
```

### 1. Ingestion (`src/lib/sync.ts`)

* On first sync an account's full history is requested (`GET /accounts/{id}/activities`, 1000 per page, paginated by `offset`/`total`). Later syncs re-request from `lastSynced − 14 days` so late-posting activities are never missed.
* Every activity is stored **exactly as received** in `Activity.raw` plus a few indexed columns. Rows are deduplicated on a **content fingerprint** (account, type, trade date, settlement date, symbol/option ticker, units, price, amount, currency, description) rather than SnapTrade's `id`, because SnapTrade documents that ids can change when a brokerage re-reports history.
* Positions and account balances are refreshed on every sync. A `SyncRun` row records every attempt.

### 2. Normalization (`src/engine/normalize.ts`)

* Only position-changing types become fills: `BUY`, `SELL`, `OPTIONEXPIRATION`, `OPTIONASSIGNMENT`, `OPTIONEXERCISE`, `EXTERNAL_ASSET_TRANSFER_IN/OUT`. Dividends, interest, contributions, withdrawals, fees, taxes and cash transfers are stored but never affect trade P&L (Kinfo also bases performance on trades only).
* Side comes from the activity **type**, never from the sign of `units` — brokerages differ on whether sells are negative.
* Options use a contract multiplier of 100 (10 for mini options). `OPTIONEXPIRATION` becomes a zero-priced closing fill, so a long option that expires realizes the full premium as a loss and a short one as a gain. Assignment/exercise close the option leg at the reported price (normally 0); the resulting stock leg arrives as its own BUY/SELL.
* Wealthsimple reports activity at **day granularity**. A timestamp that is exactly midnight UTC (or a bare date) is flagged `hasTime = false` and treated as a calendar date: it is never shifted by the user's time zone, and time-of-day analytics skip it.
* Instruments are keyed by symbol **and** currency inside one account, so `SHOP.TO` in a CAD account and a USD position are never matched together.

### 3. Trade matching (`src/engine/match.ts`)

Fills are processed per account and instrument in execution order. Same-instant ties (a day-granular buy and sell of the same symbol) are ordered so that fills extending the current position come first: flat or long → buys before sells; short → sells before buys; expirations/assignments last. This is deterministic and reproduces what a long-only Wealthsimple account actually did.

**Average cost, close at flat (default — Kinfo parity).** A position cycle opens with the first fill and becomes one trade when quantity returns to zero, however many executions it took. Realized P&L on each reducing fill is `(price − average cost of the remaining units) × qty × multiplier` (sign flipped for shorts). Adds after a partial exit re-average the remaining cost. A fill that crosses through zero is split: it closes the cycle and opens a new one in the opposite direction, fees pro-rated.

**FIFO round trips (optional).** Each closing execution is its own trade, matched against the earliest open lots; entry price is the lot-weighted average, the trade opens at the earliest matched lot and closes at the execution. Remaining lots form one OPEN trade.

Both methods realize the identical total once the position is flat — enforced by a randomized invariant test that also reconciles realized P&L against the raw cash flow of every fill.

Trade fields: `quantity` (total opened), `avgEntryPrice`, `avgExitPrice`, `costBasis`, `proceeds`, `grossPnl`, `fees` (sum of broker-reported fees), `netPnl = gross − fees`, `pnlPercent = netPnl ÷ costBasis`, `holdingSeconds`, `hasTime`, `executions`, `warnings`. Open cycles are stored as `OPEN` trades (realized part only) and **never** count toward performance.

`tradeKey` is a stable hash (method, account, instrument, opening fill, direction, sequence) so journal notes and tags survive every rebuild. Trades that disappear after a rebuild (only possible if the broker re-reports history differently) are deleted for the active method; the other method's trades and notes are kept.

### 4. Currency (`src/lib/fx.ts`)

Trades keep their native currency. Totals are converted to the user's reporting currency (CAD by default; USD optional) at the **Bank of Canada Valet** daily rate for the trade's closing date (`FX{CUR}CAD` series; previous business day's rate is carried over weekends/holidays). Rates are cached in `FxRate`. If Valet is unreachable, `FX_FALLBACK_USDCAD` is used and the trade carries a warning. Per-trade pages show both native and converted amounts.

### 5. Metrics (`src/engine/metrics.ts`) — closed trades only

| Metric | Definition |
|---|---|
| Profit | Sum of net P&L (gross − fees) of closed trades in the period, converted to the reporting currency. The "accumulated profit" curve is its running total ordered by close time. |
| Win / loss / break-even | Win = net P&L > 0 (Kinfo: "positive gain"). Break-even trades count in the denominator of win rate but are not wins. |
| Win rate | wins ÷ closed trades. |
| Average gain ($) | net P&L ÷ closed trades (Kinfo's definition). Also reported as **expectancy**. |
| Average gain (%) | mean of each trade's `pnlPercent` (gain relative to the acquisition cost of the opened quantity — Kinfo's definition). |
| Average win / loss, largest win / loss | over winning / losing trades respectively. |
| Profit factor | gross wins ÷ |gross losses| (∞ with wins and no losses). |
| Payoff ratio | average win ÷ |average loss|. |
| Max drawdown | largest peak-to-trough decline of the accumulated-profit curve (in currency; account size is never used or shown). |
| Streaks | max consecutive wins / losses; current streak. |
| Long / short | all metrics split by direction. |
| Timing | average hold (all / wins / losses), holding-period buckets (intraday, 1–3 d, 4–7 d, 1–4 w, 1–3 m, >3 m — "intraday" means opened and closed on the same local calendar day), weekday of close, entry hour (only trades with real timestamps). |
| Symbols | top 10 by trade count and by volume (bought + sold notional). Options roll up to their underlying. |
| Daily / calendar | net P&L, count, wins, losses per close day; month grid with weekly totals, green/red days. |

### 6. Verification stars (`src/engine/stars.ts`)

Modelled on Kinfo's rating: one star for a profitable trailing **30-day** window, a second for **90 days**, a third for **365 days**. Stars are cumulative — the 90-day star needs the 30-day star — so three stars always means "verified profitable over 30, 90 and 365 days". A window needs at least 3 closed trades (`minTrades`, see `starRating`). Kinfo does not publish its exact thresholds; this is our documented interpretation.

---

## SnapTrade integration

Everything SnapTrade-specific is in `src/lib/snaptrade.ts` (thin wrapper around the official SDK) and `src/lib/sync.ts`.

Connection flow:

1. First connect: `authentication.registerSnapTradeUser({ userId: "attest-<id>" })`. The returned `userSecret` is encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM) before it is stored.
2. `authentication.loginSnapTradeUser({ broker, connectionType: "read", immediateRedirect: true, customRedirect: APP_URL + "/connect/callback", reconnect? })` → the user is sent to the returned `redirectURI` (valid 5 minutes). The `broker` slug is resolved at runtime by searching `referenceData.listAllBrokerages()` for "Wealthsimple"; set `SNAPTRADE_WEALTHSIMPLE_SLUG` to pin it.
3. `/connect/callback` reads `status` / `connection_id` / `error_code`, then `connections.listBrokerageAuthorizations` + `accountInformation.listUserAccounts` to upsert connections and accounts, and kicks off the first sync.
4. `accountInformation.getAccountActivities` (paged), `getAllAccountPositions`, `syncBrokerageAuthorizationTransactions` (requested at the start of every manual/scheduled sync so the previous day's transactions are in), and `refreshBrokerageAuthorization` for the optional "Refresh from broker" button (SnapTrade bills each refresh call; data otherwise refreshes once per day).

Keeping data fresh:

* `GET /api/cron/sync` with `Authorization: Bearer $CRON_SECRET` syncs every connected user — schedule it daily (Vercel cron, GitHub Actions, `cron`, …) after SnapTrade's daily refresh.
* `POST /api/webhooks/snaptrade` accepts SnapTrade webhooks (`CONNECTION_ADDED`, `CONNECTION_BROKEN`, `ACCOUNT_TRANSACTIONS_UPDATED`, `ACCOUNT_HOLDINGS_UPDATED`, …) and syncs the affected account; the body's `webhookSecret` is compared with `SNAPTRADE_WEBHOOK_SECRET` when set.

The wrapper is typed against `snaptrade-typescript-sdk` 12.2.0's own declarations. Two things still deserve a glance in your SnapTrade dashboard on first live run: the exact brokerage slug for Wealthsimple (resolved by name unless pinned) and the webhook payload field names.

---

## Data model (Prisma)

`User` (settings + encrypted SnapTrade identity) → `BrokerConnection` → `Account` → `Activity` (raw, immutable) → `Trade` → `TradeFill` (links each trade to the activities and quantities that built it). Plus `Position` (holdings snapshot), `Tag`/`TradeTag`, `FxRate`, `SyncRun`, `Session`.

---

## Design language

Monochrome like Kinfo: near-black ink on white (or the inverse in dark mode), 1px hairline borders, rounded cards, uppercase micro-labels, tabular numerals. Colour is reserved for P&L — green `#0ca30c` / red `#d03b3b` with a neutral zero — and every coloured value also carries an explicit sign so meaning never rides on colour alone. Charts are single-series, one axis, thin marks, hover tooltips everywhere.

---

## Deploying

Any Node host works (`npm run build && npm start`) with a PostgreSQL URL. Set `APP_URL` to the public origin — SnapTrade redirects back to it. Run `npx prisma migrate deploy` on release. Schedule `/api/cron/sync` daily and point SnapTrade webhooks at `/api/webhooks/snaptrade`.
