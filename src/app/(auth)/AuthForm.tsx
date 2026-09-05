"use client";

import { useActionState } from "react";
import type { AuthState } from "./actions";

export function AuthForm({ action, mode }: { action: (prev: AuthState, formData: FormData) => Promise<AuthState>; mode: "login" | "signup" }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {mode === "signup" ? (
        <>
          <Field label="Display name" name="displayName" placeholder="How you appear on your profile" autoComplete="name" />
          <Field label="Username" name="username" placeholder="lowercase, numbers, underscores" autoComplete="username" pattern="[a-z0-9_]{3,24}" hint="Your public profile lives at /u/username." />
        </>
      ) : null}
      <Field label="Email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
      <Field label="Password" name="password" type="password" placeholder={mode === "signup" ? "At least 10 characters" : "Your password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 10 : undefined} />
      {state?.error ? (
        <p role="alert" className="rounded-xl bg-loss-soft px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
      </button>
    </form>
  );
}

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input className="input" {...props} />
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}
