"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("attest-theme");
      if (stored === "dark" || stored === "light") setTheme(stored);
    } catch {}
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem("attest-theme");
        document.documentElement.removeAttribute("data-theme");
      } else {
        localStorage.setItem("attest-theme", next);
        document.documentElement.setAttribute("data-theme", next);
      }
    } catch {}
  }

  const order: Theme[] = ["light", "dark", "system"];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const label = theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light";

  return (
    <button type="button" className="btn-ghost text-xs" onClick={() => apply(next)} aria-label={`Theme: ${label}. Switch to ${next}`}>
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border border-current" style={{ background: theme === "dark" ? "currentColor" : theme === "light" ? "transparent" : "linear-gradient(90deg, currentColor 50%, transparent 50%)" }} />
      {label}
    </button>
  );
}
