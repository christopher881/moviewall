"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard",   label: "Dashboard",   icon: "▦" },
  { href: "/posters",     label: "Posters",     icon: "▢" },
  { href: "/collections", label: "Collections", icon: "▣" },
  { href: "/displays",    label: "Displays",    icon: "▤" },
  { href: "/schedules",   label: "Schedules",   icon: "▥" }
];

export default function SidebarNav({
  authEnabled = false,
  onNavigate
}: {
  authEnabled?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    onNavigate?.();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="flex flex-col h-full p-3">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2 px-3 py-4 mb-2"
      >
        <span className="w-8 h-8 rounded-lg bg-gold-500 text-ink-950 flex items-center justify-center font-bold">
          M
        </span>
        <span className="text-lg font-semibold tracking-tight">
          Movie<span className="text-gold">Wall</span>
        </span>
      </Link>

      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition",
                active
                  ? "bg-ink-800 text-white border border-ink-700"
                  : "text-zinc-400 hover:bg-ink-850 hover:text-white"
              )}
            >
              <span className={cn("text-base", active ? "text-gold" : "text-zinc-500")}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>

      {authEnabled && (
        <div className="mt-auto pt-3 border-t border-ink-700">
          <button
            type="button"
            onClick={signOut}
            className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-zinc-400 hover:bg-ink-850 hover:text-white transition"
          >
            <span className="text-base text-zinc-500">⇦</span>
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
