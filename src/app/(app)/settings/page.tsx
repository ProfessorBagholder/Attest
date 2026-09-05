import { requireUser } from "@/lib/auth-next";
import { SectionHeading } from "@/components/ui";
import { updatePrivacyAction, updateProfileAction, updateReportingAction } from "../actions";
import { SettingsForm, Toggle } from "./SettingsForms";

export const metadata = { title: "Settings" };

const COMMON_TIME_ZONES = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "UTC"];

export default async function SettingsPage() {
  const user = await requireUser();
  const zones = COMMON_TIME_ZONES.includes(user.timeZone) ? COMMON_TIME_ZONES : [user.timeZone, ...COMMON_TIME_ZONES];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-3">Signed in as {user.email}</p>
      </div>

      <section id="profile">
        <SectionHeading title="Profile" description="Shown on your public page and the leaderboard when sharing is on." />
        <SettingsForm action={updateProfileAction}>
          <label className="block">
            <span className="label mb-1 block">Display name</span>
            <input className="input" name="displayName" defaultValue={user.displayName} maxLength={60} />
          </label>
          <label className="block">
            <span className="label mb-1 block">Username</span>
            <input className="input" name="username" defaultValue={user.username} pattern="[a-z0-9_]{3,24}" />
            <span className="mt-1 block text-xs text-ink-3">Your profile lives at /u/{user.username}. Real names are never required.</span>
          </label>
          <label className="block">
            <span className="label mb-1 block">Bio</span>
            <textarea className="input min-h-[80px]" name="bio" defaultValue={user.bio ?? ""} maxLength={280} placeholder="What you trade and how." />
          </label>
        </SettingsForm>
      </section>

      <section id="sharing">
        <SectionHeading title="Sharing & verification" description="You are private by default. Turn sharing on to publish your broker-verified record and compete on the leaderboard." />
        <SettingsForm action={updatePrivacyAction}>
          <Toggle name="isPublic" label="Public profile" description="Anyone with the link can see your verified performance and you appear on the leaderboard." defaultChecked={user.isPublic} />
          <Toggle name="showDollars" label="Show dollar amounts" description="Off shows percentages and win rate only. Account size is never displayed either way." defaultChecked={user.showDollars} />
          <Toggle name="hideOpenTrades" label="Protect open positions" description="Hide trades that are still open from your public profile until they close." defaultChecked={user.hideOpenTrades} />
        </SettingsForm>
      </section>

      <section id="reporting">
        <SectionHeading title="Reporting" description="How executions become trades and how everything is totalled. Changing these rebuilds your trades; journal notes follow the trade they belong to." />
        <SettingsForm action={updateReportingAction} submitLabel="Save and rebuild">
          <fieldset className="space-y-2">
            <legend className="label mb-1">Trade matching</legend>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input type="radio" name="matchingMethod" value="AVERAGE_COST" defaultChecked={user.matchingMethod === "AVERAGE_COST"} className="mt-1 accent-current" />
              <span>
                <span className="block text-sm font-medium">Average cost, close at flat</span>
                <span className="block text-xs text-ink-3">A position becomes one trade when its quantity returns to zero, however many executions it took. Entry is the average cost. This is the convention Kinfo uses.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input type="radio" name="matchingMethod" value="FIFO" defaultChecked={user.matchingMethod === "FIFO"} className="mt-1 accent-current" />
              <span>
                <span className="block text-sm font-medium">FIFO round trips</span>
                <span className="block text-xs text-ink-3">Every closing execution is its own trade, matched against the earliest open lots. More trades, same total P&L.</span>
              </span>
            </label>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="label mb-1 block">Reporting currency</span>
              <select className="select" name="baseCurrency" defaultValue={user.baseCurrency}>
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
              <span className="mt-1 block text-xs text-ink-3">Trades keep their native currency; totals convert at the Bank of Canada rate on the closing date.</span>
            </label>
            <label className="block">
              <span className="label mb-1 block">Time zone</span>
              <select className="select" name="timeZone" defaultValue={user.timeZone}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink-3">Used for the calendar and time-of-day analytics.</span>
            </label>
          </div>
        </SettingsForm>
      </section>
    </div>
  );
}
