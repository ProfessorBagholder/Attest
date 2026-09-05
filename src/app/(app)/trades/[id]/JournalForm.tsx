"use client";

import { useActionState, useState } from "react";
import { saveTradeJournalAction, type ActionState } from "../../actions";

type Initial = { notes: string; setup: string; mistakes: string; rating: number | null; tags: string };

export function JournalForm({ tradeId, initial }: { tradeId: string; initial: Initial }) {
  const [state, formAction, pending] = useActionState(saveTradeJournalAction, undefined as ActionState);
  const [rating, setRating] = useState<number | null>(initial.rating);

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <input type="hidden" name="tradeId" value={tradeId} />
      <input type="hidden" name="rating" value={rating ?? ""} />
      <div>
        <span className="label mb-1 block">Execution rating</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Execution rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} out of 5`}
              onClick={() => setRating(rating === n ? null : n)}
              className={`h-8 w-8 rounded-full border text-sm ${rating !== null && n <= rating ? "border-ink bg-ink text-paper" : "border-line text-ink-3 hover:border-ink"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-3">How well you followed your plan, independent of the outcome.</p>
      </div>
      <label className="block">
        <span className="label mb-1 block">Setup</span>
        <input className="input" name="setup" defaultValue={initial.setup} placeholder="Breakout, pullback, earnings, …" maxLength={120} />
      </label>
      <label className="block">
        <span className="label mb-1 block">Tags</span>
        <input className="input" name="tags" defaultValue={initial.tags} placeholder="comma separated: momentum, oversized, news" />
      </label>
      <label className="block">
        <span className="label mb-1 block">Notes</span>
        <textarea className="input min-h-[140px]" name="notes" defaultValue={initial.notes} placeholder="What you saw, why you entered, how you managed it." maxLength={5000} />
      </label>
      <label className="block">
        <span className="label mb-1 block">Mistakes / lessons</span>
        <textarea className="input min-h-[80px]" name="mistakes" defaultValue={initial.mistakes} placeholder="What you would do differently." maxLength={1000} />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs ${state?.error ? "text-loss" : "text-ink-3"}`} role="status">
          {state?.error ?? state?.message ?? ""}
        </span>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save journal"}
        </button>
      </div>
    </form>
  );
}
