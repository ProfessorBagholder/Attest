import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-sm text-ink-3">The page you asked for does not exist or is private.</p>
      <Link href="/" className="btn-secondary">
        Back home
      </Link>
    </div>
  );
}
