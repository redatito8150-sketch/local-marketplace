"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Reflects <html>'s actual class on mount (already set by ThemeScript.tsx
// before hydration) rather than assuming light — avoids a mismatch flash
// on a visitor whose OS/localStorage says dark.
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private browsing / storage disabled — the toggle still works for
      // this page load, it just won't persist across visits.
    }
  };

  if (!mounted) {
    // Reserves the same footprint as the real button so nothing shifts
    // once it hydrates — never renders a guessed icon state.
    return <span aria-hidden className={`inline-block h-9 w-9 ${className}`} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-stone-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 ${className}`}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />}
    </button>
  );
}
