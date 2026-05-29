"use client";

import { createContext, useContext, useState } from "react";
import SidebarNav from "./SidebarNav";

export const MobileMenuContext = createContext<{ open: () => void }>({ open: () => {} });
export function useMobileMenu() {
  return useContext(MobileMenuContext);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-ink-950">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-ink-700 bg-ink-900">
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 border-r border-ink-700 shadow-2xl">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0">
        <MobileMenuContext.Provider value={{ open: () => setMobileOpen(true) }}>
          {children}
        </MobileMenuContext.Provider>
      </main>
    </div>
  );
}
