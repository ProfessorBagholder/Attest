"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} className="tab whitespace-nowrap" aria-current={active ? "true" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
