"use client";

import Link from "next/link";

export default function TopBar({
  title,
  subtitle,
  onMenu,
  actions
}: {
  title: string;
  subtitle?: string;
  onMenu?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-ink-950/80 border-b border-ink-700">
      <div className="flex items-center gap-3 px-4 sm:px-8 h-16">
        <button
          type="button"
          onClick={onMenu}
          className="md:hidden btn-ghost px-2 py-1"
          aria-label="Open menu"
        >
          ☰
        </button>
        <Link href="/dashboard" className="md:hidden text-base font-semibold">
          Movie<span className="text-gold">Wall</span>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-zinc-400 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}
