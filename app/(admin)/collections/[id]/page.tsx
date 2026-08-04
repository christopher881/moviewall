"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Collection, CollectionPosterWithPoster, Poster } from "@/types";
import { useMobileMenu } from "@/components/AdminLayout";
import TopBar from "@/components/TopBar";
import Modal from "@/components/Modal";

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { open } = useMobileMenu();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionPosterWithPoster[]>([]);
  const [allPosters, setAllPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [c, items, allP] = await Promise.all([
      supabase.from("collections").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("collection_posters")
        .select("*, poster:posters(*)")
        .eq("collection_id", id)
        .order("sort_order"),
      supabase.from("posters").select("*").order("title")
    ]);
    if (c.error || items.error || allP.error) {
      setError(c.error?.message || items.error?.message || allP.error?.message || "Load failed");
    } else {
      setCollection((c.data as Collection) ?? null);
      setItems((items.data ?? []) as CollectionPosterWithPoster[]);
      setAllPosters((allP.data ?? []) as Poster[]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`collection-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "collection_posters", filter: `collection_id=eq.${id}` },
        load
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "posters" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  const linkedIds = useMemo(() => new Set(items.map((i) => i.poster_id)), [items]);
  const candidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return allPosters
      .filter((p) => !linkedIds.has(p.id))
      .filter((p) => !q || p.title.toLowerCase().includes(q));
  }, [allPosters, linkedIds, pickerQuery]);

  async function addPoster(posterId: string) {
    setBusy(true);
    try {
      const nextSort = items.length;
      const { error: iErr } = await supabase
        .from("collection_posters")
        .insert({ collection_id: id, poster_id: posterId, sort_order: nextSort });
      if (iErr) throw iErr;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(linkId: string) {
    setBusy(true);
    try {
      const { error: dErr } = await supabase
        .from("collection_posters")
        .delete()
        .eq("id", linkId);
      if (dErr) throw dErr;
      // Re-pack sort_order so it stays clean.
      const remaining = items.filter((i) => i.id !== linkId);
      await Promise.all(
        remaining.map((it, idx) =>
          it.sort_order === idx
            ? Promise.resolve()
            : supabase
                .from("collection_posters")
                .update({ sort_order: idx })
                .eq("id", it.id)
        )
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Move the dragged item to the dropped-on item's position and re-pack sort_order. */
  async function reorderByDrop(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const from = items.findIndex((i) => i.id === sourceId);
    const to = items.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    // Optimistic local update so the grid doesn't jump while the writes land.
    setItems(next.map((it, idx) => ({ ...it, sort_order: idx })));

    setBusy(true);
    try {
      await Promise.all(
        next.map((it, idx) =>
          it.sort_order === idx
            ? Promise.resolve()
            : supabase
                .from("collection_posters")
                .update({ sort_order: idx })
                .eq("id", it.id)
        )
      );
    } catch (err) {
      setError((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function randomizeOrder() {
    if (items.length < 2) return;
    setBusy(true);
    try {
      // Fisher-Yates shuffle of the current item order, then write new sort_order values.
      const shuffled = [...items];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      await Promise.all(
        shuffled.map((it, idx) =>
          supabase
            .from("collection_posters")
            .update({ sort_order: idx })
            .eq("id", it.id)
        )
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(linkId: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === linkId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    setBusy(true);
    try {
      const a = items[idx];
      const b = items[swap];
      await Promise.all([
        supabase.from("collection_posters").update({ sort_order: b.sort_order }).eq("id", a.id),
        supabase.from("collection_posters").update({ sort_order: a.sort_order }).eq("id", b.id)
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Collection" onMenu={open} />
        <div className="p-8 text-zinc-500">Loading…</div>
      </>
    );
  }
  if (!collection) {
    return (
      <>
        <TopBar title="Collection" onMenu={open} />
        <div className="p-8">
          <p className="text-zinc-400 mb-3">Collection not found.</p>
          <button onClick={() => router.push("/collections")} className="btn-secondary">
            Back to collections
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={collection.name}
        subtitle={`${items.length} poster${items.length === 1 ? "" : "s"}`}
        onMenu={open}
        actions={
          <>
            <Link href="/collections" className="btn-ghost hidden sm:inline-flex">
              ← Back
            </Link>
            <button
              onClick={randomizeOrder}
              className="btn-secondary hidden sm:inline-flex"
              disabled={busy || items.length < 2}
              title="Shuffle the order of posters in this collection"
            >
              ⇄ Randomize
            </button>
            <button onClick={() => setPickerOpen(true)} className="btn-primary">
              + Add posters
            </button>
          </>
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        {error && (
          <div className="card p-4 border-red-500/40 text-red-300">{error}</div>
        )}

        {items.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-zinc-400 mb-3">This collection has no posters yet.</p>
            <button onClick={() => setPickerOpen(true)} className="btn-primary">
              + Add posters from your library
            </button>
          </div>
        ) : (
          <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-zinc-500 mr-auto">
              Drag posters to reorder, or use the ↑ ↓ buttons. Order here is the slideshow order.
            </p>
            <button
              onClick={randomizeOrder}
              className="btn-secondary sm:hidden text-xs"
              disabled={busy || items.length < 2}
            >
              ⇄ Randomize
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mt-3">
            {items.map((it, idx) => (
              <div
                key={it.id}
                draggable
                onDragStart={(e) => {
                  setDragId(it.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== it.id) setDragOverId(it.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === it.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) reorderByDrop(dragId, it.id);
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                className={
                  "card overflow-hidden flex flex-col cursor-move transition " +
                  (dragId === it.id ? "opacity-40 " : "") +
                  (dragOverId === it.id && dragId !== it.id
                    ? "ring-2 ring-gold-500 "
                    : "")
                }
              >
                <div className="relative aspect-[2/3] bg-ink-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.poster.image_url}
                    alt={it.poster.title}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    loading="lazy"
                  />
                  <span className="absolute top-2 left-2 badge bg-black/60 border border-white/10">
                    #{idx + 1}
                  </span>
                </div>
                <div className="p-2">
                  <p className="text-sm truncate">{it.poster.title}</p>
                  <div className="flex justify-between mt-1">
                    <div className="flex gap-1">
                      <button
                        className="btn-ghost text-xs px-2 py-1"
                        disabled={busy || idx === 0}
                        onClick={() => move(it.id, -1)}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="btn-ghost text-xs px-2 py-1"
                        disabled={busy || idx === items.length - 1}
                        onClick={() => move(it.id, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      className="btn-ghost text-xs px-2 py-1 text-red-400"
                      disabled={busy}
                      onClick={() => removeLink(it.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add posters"
        size="lg"
      >
        <div className="space-y-3">
          <input
            className="input"
            placeholder="Search posters…"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
          />
          {candidates.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No more posters to add.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
              {candidates.map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  onClick={() => addPoster(p.id)}
                  className="card card-hover overflow-hidden text-left"
                >
                  <div className="relative aspect-[2/3] bg-ink-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.image_url}
                      alt={p.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-xs truncate p-1.5">{p.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
