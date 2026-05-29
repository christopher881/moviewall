"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Display, Collection, Poster } from "@/types";
import { useMobileMenu } from "@/components/AdminLayout";
import TopBar from "@/components/TopBar";
import DisplayStatusCard from "@/components/DisplayStatusCard";

export default function DashboardPage() {
  const { open } = useMobileMenu();
  const [displays, setDisplays] = useState<Display[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [d, c, p] = await Promise.all([
      supabase.from("displays").select("*").order("created_at", { ascending: false }),
      supabase.from("collections").select("*").order("created_at", { ascending: false }),
      supabase.from("posters").select("*").order("created_at", { ascending: false })
    ]);
    if (d.error || c.error || p.error) {
      setError(d.error?.message || c.error?.message || p.error?.message || "Failed to load");
    } else {
      setDisplays((d.data ?? []) as Display[]);
      setCollections((c.data ?? []) as Collection[]);
      setPosters((p.data ?? []) as Poster[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "displays" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "posters" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const collectionById = (id: string | null) =>
    collections.find((c) => c.id === id) ?? null;
  const posterById = (id: string | null) =>
    posters.find((p) => p.id === id) ?? null;

  const activePosters = posters.filter((p) => p.active).length;
  const activeCollections = collections.filter((c) => c.active).length;
  const onlineDisplays = displays.filter((d) => {
    if (!d.last_seen) return false;
    return Date.now() - new Date(d.last_seen).getTime() < 90_000;
  }).length;

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Overview of your MovieWall displays"
        onMenu={open}
        actions={
          <Link href="/posters" className="btn-primary hidden sm:inline-flex">
            Upload poster
          </Link>
        }
      />
      <div className="p-4 sm:p-8 space-y-8">
        {error && (
          <div className="card p-4 border-red-500/40 text-red-300">{error}</div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Displays" value={displays.length} />
          <Stat label="Online" value={onlineDisplays} accent="teal" />
          <Stat label="Posters" value={activePosters} />
          <Stat label="Collections" value={activeCollections} />
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickAction
            href="/posters"
            title="Upload poster"
            desc="Add a movie poster to your library"
          />
          <QuickAction
            href="/collections"
            title="Manage collections"
            desc="Create and arrange poster groupings"
          />
          <QuickAction
            href="/displays"
            title="Display settings"
            desc="Configure your wall-mounted TVs"
          />
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Displays</h2>
            <Link href="/displays" className="text-sm text-zinc-400 hover:text-white">
              Manage all →
            </Link>
          </div>
          {loading && displays.length === 0 ? (
            <div className="card p-8 text-center text-zinc-500">Loading…</div>
          ) : displays.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-400 mb-3">No displays yet.</p>
              <Link href="/displays" className="btn-primary">
                Create your first display
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displays.map((d) => (
                <DisplayStatusCard
                  key={d.id}
                  display={d}
                  collection={collectionById(d.active_collection_id)}
                  poster={posterById(d.active_poster_id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  accent
}: {
  label: string;
  value: number | string;
  accent?: "gold" | "teal";
}) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={
          "text-2xl font-semibold mt-1 " +
          (accent === "teal" ? "text-teal" : accent === "gold" ? "text-gold" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  title,
  desc
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card card-hover p-5 flex items-center justify-between group"
    >
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="text-sm text-zinc-400 mt-1">{desc}</p>
      </div>
      <span className="text-gold opacity-60 group-hover:opacity-100 transition">→</span>
    </Link>
  );
}
