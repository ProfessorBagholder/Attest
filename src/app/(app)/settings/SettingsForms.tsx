"use client";

import { useActionState } from "react";
import type { ActionState } from "../actions";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function SettingsForm({ action, children, submitLabel = "Save" }: { action: Action; children: React.ReactNode; submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined as ActionState);
  return (
    <form action={formAction} className="card space-y-4 p-4">
      {children}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className={`text-xs ${state?.error ? "text-loss" : "text-ink-3"}`} role="status">
          {state?.error ?? state?.message ?? ""}
        </span>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function Toggle({ name, label, description, defaultChecked }: { name: string; label: string; description: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-4 w-4 accent-current" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-ink-3">{description}</span>
      </span>
    </label>
  );
}
