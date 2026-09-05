import Link from "next/link";
import type { User } from "@prisma/client";
import { Logo } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import { NavLinks } from "./NavLinks";
import { logoutAction } from "@/app/(auth)/actions";

export const APP_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/journal", label: "Journal" },
  { href: "/trades", label: "Trades" },
  { href: "/analytics", label: "Analytics" },
  { href: "/positions", label: "Positions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function AppNav({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Logo />
        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Primary">
          <NavLinks links={APP_LINKS} />
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link href={`/u/${user.username}`} className="btn-ghost text-xs" title="Your public profile">
            @{user.username}
          </Link>
          <Link href="/settings" className="btn-ghost text-xs">
            Settings
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost text-xs">
              Log out
            </button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1 md:hidden" aria-label="Primary mobile">
        <NavLinks links={APP_LINKS} />
      </nav>
    </header>
  );
}

export function PublicNav({ user }: { user: User | null }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Logo />
        <nav className="flex items-center gap-1 text-sm" aria-label="Public">
          <Link href="/leaderboard" className="btn-ghost text-xs">
            Leaderboard
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <Link href="/dashboard" className="btn-primary text-xs">
              Open journal
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost text-xs">
                Log in
              </Link>
              <Link href="/signup" className="btn-primary text-xs">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
