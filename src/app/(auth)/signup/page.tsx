import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your verified journal</h1>
      <p className="mb-6 mt-1 text-sm text-ink-3">Free. Takes under a minute. Your profile stays private until you decide otherwise.</p>
      <AuthForm action={signupAction} mode="signup" />
      <p className="mt-6 text-sm text-ink-3">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
