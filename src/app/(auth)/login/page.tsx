import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-ink-3">Your journal syncs from your broker, so there is nothing to catch up on.</p>
      <AuthForm action={loginAction} mode="login" />
      <p className="mt-6 text-sm text-ink-3">
        New here?{" "}
        <Link href="/signup" className="text-ink underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
