import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { snaptradeConfigured } from "@/lib/env";
import { formatMoney, relativeTime } from "@/lib/format";
import { Empty, SectionHeading, VerifiedBadge } from "@/components/ui";
import { connectBrokerAction, disconnectBrokerAction, reconnectBrokerAction, refreshFromBrokerAction, syncNowAction } from "../actions";

export const metadata = { title: "Accounts" };

type Search = { welcome?: string; connected?: string; synced?: string; refreshed?: string; disconnected?: string; error?: string };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [connections, runs] = await Promise.all([
    prisma.brokerConnection.findMany({ where: { userId: user.id, status: { not: "REMOVED" } }, include: { accounts: { orderBy: { name: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.syncRun.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 10 }),
  ]);
  const accountsById = new Map(connections.flatMap((c) => c.accounts.map((a) => [a.id, a] as const)));
  const configured = snaptradeConfigured();

  const notice = params.error
    ? { tone: "loss", text: params.error === "snaptrade-not-configured" ? "SnapTrade credentials are not configured on the server. Add SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY to .env." : decodeURIComponent(params.error) }
    : params.connected
      ? { tone: "gain", text: "Wealthsimple connected. Your history is importing — the first sync can take a minute." }
      : params.synced
        ? { tone: "gain", text: "Sync complete." }
        : params.refreshed
          ? { tone: "gain", text: "Refresh requested from the brokerage. SnapTrade will update holdings and recent transactions shortly; run a sync afterwards." }
          : params.disconnected
            ? { tone: "flat", text: "Connection removed. Imported history stays in your journal." }
            : params.welcome
              ? { tone: "flat", text: "Welcome. Connect Wealthsimple to start building a verified track record." }
              : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-ink-3">Read-only broker connections through SnapTrade. Credentials are never stored here.</p>
        </div>
        <div className="flex gap-2">
          {connections.length ? (
            <form action={syncNowAction}>
              <button type="submit" className="btn-secondary">
                Sync now
              </button>
            </form>
          ) : null}
          <form action={connectBrokerAction}>
            <button type="submit" className="btn-primary" disabled={!configured}>
              Connect Wealthsimple
            </button>
          </form>
        </div>
      </div>

      {notice ? (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm ${notice.tone === "loss" ? "bg-loss-soft text-loss" : notice.tone === "gain" ? "bg-gain-soft text-gain" : "bg-paper-2 text-ink-2"}`}>
          {notice.text}
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-3">
          Broker connections need SnapTrade API credentials on the server. Until then you can explore with the demo data (<code className="font-mono text-xs">npm run seed:demo</code>).
        </p>
      ) : null}

      {connections.length === 0 ? (
        <Empty title="No broker connected">
          <ol className="mx-auto mt-2 max-w-md list-decimal space-y-1 text-left text-sm">
            <li>Click Connect Wealthsimple. You will be taken to SnapTrade&apos;s secure connection portal.</li>
            <li>Log in to Wealthsimple there and approve read-only access.</li>
            <li>You come back here and your full transaction history imports automatically.</li>
          </ol>
        </Empty>
      ) : (
        <div className="space-y-4">
          {connections.map((connection) => (
            <section key={connection.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {connection.brokerageName}
                      {connection.status === "ACTIVE" ? <VerifiedBadge size="sm" label="Connected" /> : <span className="pill border-loss/50 text-loss">Disabled</span>}
                    </div>
                    <div className="text-xs text-ink-3">
                      {connection.connectionType} access · connected {connection.createdAt.toLocaleDateString("en-CA")} · last sync {relativeTime(connection.lastSyncedAt)}
                    </div>
                    {connection.disabledReason ? <div className="mt-1 text-xs text-loss">{connection.disabledReason}</div> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {connection.status === "DISABLED" ? (
                    <form action={reconnectBrokerAction}>
                      <input type="hidden" name="authorizationId" value={connection.snaptradeAuthorizationId} />
                      <button type="submit" className="btn-primary text-xs">
                        Reconnect
                      </button>
                    </form>
                  ) : null}
                  {configured && !connection.snaptradeAuthorizationId.startsWith("demo-") ? (
                    <form action={refreshFromBrokerAction}>
                      <input type="hidden" name="authorizationId" value={connection.snaptradeAuthorizationId} />
                      <button type="submit" className="btn-secondary text-xs" title="Asks SnapTrade to pull fresh data from the brokerage now. SnapTrade bills this per request.">
                        Refresh from broker
                      </button>
                    </form>
                  ) : null}
                  <form action={disconnectBrokerAction}>
                    <input type="hidden" name="authorizationId" value={connection.snaptradeAuthorizationId} />
                    <button type="submit" className="btn-ghost text-xs text-loss">
                      Disconnect
                    </button>
                  </form>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Type</th>
                      <th>Currency</th>
                      <th className="text-right">Balance</th>
                      <th>Transactions synced</th>
                      <th>Holdings synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connection.accounts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="font-medium">{a.name ?? a.institutionName}</span>
                          {a.number ? <span className="block text-xs text-ink-3">{a.number}</span> : null}
                        </td>
                        <td className="text-ink-2">{a.rawType ?? "—"}</td>
                        <td className="text-ink-2">{a.currency}</td>
                        <td className="num text-right">{a.balanceTotal === null ? "—" : formatMoney(a.balanceTotal, a.balanceCurrency ?? a.currency)}</td>
                        <td className="text-ink-2">{relativeTime(a.transactionsSyncedAt)}</td>
                        <td className="text-ink-2">{relativeTime(a.holdingsSyncedAt)}</td>
                      </tr>
                    ))}
                    {connection.accounts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-ink-3">
                          No accounts discovered yet. Run a sync.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <section>
        <SectionHeading title="Sync log" description="SnapTrade refreshes brokerage data once a day; each sync here pulls whatever is new and rebuilds trades." />
        {runs.length === 0 ? (
          <p className="text-sm text-ink-3">No syncs yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Account</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th className="text-right">Fetched</th>
                  <th className="text-right">New</th>
                  <th className="text-right">Trades</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap text-ink-2">{run.startedAt.toLocaleString("en-CA", { timeZone: user.timeZone })}</td>
                    <td className="text-ink-2">{run.accountId ? accountsById.get(run.accountId)?.name ?? "—" : "All"}</td>
                    <td className="text-ink-2">{run.trigger}</td>
                    <td>
                      <span className={run.status === "FAILED" ? "pill-loss" : run.status === "SUCCEEDED" ? "pill-gain" : "pill"}>{run.status.toLowerCase()}</span>
                      {run.error ? <span className="block max-w-xs truncate text-xs text-loss" title={run.error}>{run.error}</span> : null}
                    </td>
                    <td className="num text-right">{run.activitiesFetched}</td>
                    <td className="num text-right">{run.activitiesInserted}</td>
                    <td className="num text-right">{run.tradesBuilt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
