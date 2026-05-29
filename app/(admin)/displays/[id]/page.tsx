"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Collection, Display, Poster } from "@/types";
import { useMobileMenu } from "@/components/AdminLayout";
import TopBar from "@/components/TopBar";
import SettingsForm from "@/components/SettingsForm";
import DisplayPreview from "@/components/DisplayPreview";
import { isOnline, timeAgo } from "@/lib/utils";

export default function DisplayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { open } = useMobileMenu();

  const [display, setDisplay] = useState<Display | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [previewPoster, setPreviewPoster] = useState<Poster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [d, c, p] = await Promise.all([
      supabase.from("displays").select("*").eq("id", id).maybeSingle(),
      supabase.from("collections").select("*").order("name"),
      supabase.from("posters").select("*").order("title")
    ]);
    if (d.error || c.error || p.error) {
      setError(d.error?.message || c.error?.message || p.error?.message || "Load failed");
    } else {
      setDisplay((d.data as Display) ?? null);
      setCollections((c.data ?? []) as Collection[]);
      setPosters((p.data ?? []) as Poster[]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    if (!id) return;
    const ch = supabase
      .channel(`display-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "displays", filter: `id=eq.${id}` },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  // Compute preview poster: in single mode show active_poster_id; in collection mode show first.
  useEffect(() => {
    if (!display) return;
    if (display.display_mode === "single" && display.active_poster_id) {
      const p = posters.find((x) => x.id === display.active_poster_id);
      setPreviewPoster(p ?? null);
      return;
    }
    if (display.active_collection_id) {
      (async () => {
        const { data } = await supabase
          .from("collection_posters")
          .select("poster:posters(*)")
          .eq("collection_id", display.active_collection_id)
          .order("sort_order")
          .limit(1);
        const first = (data?.[0]?.poster as Poster | undefined) ?? null;
        setPreviewPoster(first);
      })();
    } else {
      setPreviewPoster(null);
    }
  }, [display, posters]);

  function copyUrl() {
    if (typeof window === "undefined" || !id) return;
    const url = `${window.location.origin}/display/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loading) {
    return (
      <>
        <TopBar title="Display" onMenu={open} />
        <div className="p-8 text-zinc-500">Loading…</div>
      </>
    );
  }
  if (!display) {
    return (
      <>
        <TopBar title="Display" onMenu={open} />
        <div className="p-8">
          <p className="text-zinc-400 mb-3">Display not found.</p>
          <button onClick={() => router.push("/displays")} className="btn-secondary">
            Back to displays
          </button>
        </div>
      </>
    );
  }

  const online = isOnline(display.last_seen);

  return (
    <>
      <TopBar
        title={display.name}
        subtitle={display.location ?? undefined}
        onMenu={open}
        actions={
          <>
            <Link href="/displays" className="btn-ghost hidden sm:inline-flex">
              ← Back
            </Link>
            <Link href={`/display/${display.id}`} target="_blank" className="btn-secondary">
              Open TV ↗
            </Link>
          </>
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        {error && (
          <div className="card p-4 border-red-500/40 text-red-300">{error}</div>
        )}

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <SettingsForm
            display={display}
            collections={collections}
            posters={posters}
            onSaved={(d) => setDisplay(d)}
          />

          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  TV display URL
                </p>
                <p className="font-mono text-sm break-all mt-1">
                  /display/{display.id}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={copyUrl} className="btn-secondary flex-1">
                  {copied ? "Copied ✓" : "Copy full URL"}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Open this URL in your TV&apos;s browser, in full-screen.
              </p>
            </div>

            <div className="card p-4 space-y-2">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Status</p>
              <p>
                <span
                  className={
                    "inline-block w-2 h-2 rounded-full mr-2 " +
                    (online ? "bg-emerald-400" : "bg-zinc-500")
                  }
                />
                {online ? "Online" : "Offline"}
              </p>
              <p className="text-xs text-zinc-500">
                Last seen {timeAgo(display.last_seen)}
              </p>
            </div>

            <DisplayPreview display={display} poster={previewPoster} />
          </div>
        </div>
      </div>
    </>
  );
}
