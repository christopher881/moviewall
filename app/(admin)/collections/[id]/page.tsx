"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // Highest sort_order we've handed out locally. Prevents rapid successive adds
  // from all computing the same value before the realtime refresh lands.
  const nextSortRef = useRef(0);
  // Suppress the realtime refetch we trigger ourselves while writing an order.
  const writingOrderRef = useRef(false);

  /** Persist a specific ordering, re-packing sort_order to 0..n-1. */
  const persistOrder = useCallback(
    async (ordered: CollectionPosterWithPoster[]) => {
      writingOrderRef.current = true;
      setBusy(true);
      try {
        const changed = ordered
          .map((it, idx) => ({ it, idx }))
          .filter(({ it, idx }) => it.sort_order !== idx);
        if (changed.length > 0) {
          await Promise.all(
            changed.map(({ it, idx }) =>
              supabase
                .from("collection_posters")
                .update({ sort_order: idx })
                .eq("id", it.id)
            )
          );
        }
        nextSortRef.current = ordered.length;
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
        // Let the trailing realtime events settle before re-enabling refetch.
        setTimeout(() => {
          writingOrderRef.current = false;
        }, 600);
      }
    },
    []
  );

  const load = useCallback(async () => {
    if (!id) return;
    const [c, linkRes, allP] = await Promise.all([
      supabase.from("collections").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("collection_posters")
        .select("*, poster:posters(*)")
        .eq("collection_id", id)
        .order("sort_order")
        .order("created_at"),
      supabase.from("posters").select("*").order("title")
    ]);
    if (c.error || linkRes.error || allP.error) {
      setError(
        c.error?.message || linkRes.error?.message || allP.error?.message || "Load failed"
      );
      setLoading(false);
      return;
    }

    const rows = (linkRes.data ?? []) as CollectionPosterWithPoster[];
    setCollection((c.data as Collection) ?? null);
    setItems(rows);
    setAllPosters((allP.data ?? []) as Poster[]);
    nextSortRef.current = rows.length;
    setLoading(false);

    // Repair legacy/duplicate sort_order values (e.g. several posters added in
    // quick succession all landing on the same number). Without unique values
    // the up/down buttons have nothing to swap and appear to do nothing.
    const needsRepair = rows.some((r, i) => r.sort_order !== i);
    const hasDuplicates =
      new Set(rows.map((r) => r.sort_order)).size !== rows.length;
    if (rows.length > 1 && needsRepair && hasDuplicates) {
      await persistOrder(rows);
    }
  }, [id, persistOrder]);

  useEffect(() => {
    load();
    const onRemote = () => {
      if (writingOrderRef.current) return;
      load();
    };
    const ch = supabase
      .channel(`collection-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "collection_posters", filter: `collection_id=eq.${id}` },
        onRemote
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, onRemote)
      .on("postgres_changes", { event: "*", schema: "public", table: "posters" }, onRemote)
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
    // Reserve a slot synchronously so clicking several posters quickly doesn't
    // give them all the same sort_order.
    const sort = nextSortRef.current;
    nextSortRef.current += 1;
    try {
      const { error: iErr } = await supabase
        .from("collection_posters")
        .insert({ collection_id: id, poster_id: posterId, sort_order: sort });
      if (iErr) throw iErr;
    } catch (err) {
      setError((err as Error).message);
      nextSortRef.current -= 1;
    }
  }

  async function removeLink(linkId: string) {
    const remaining = items.filter((i) => i.id !== linkId);
    setItems(remaining);
    setBusy(true);
    try {
      const { error: dErr } = await supabase
        .from("collection_posters")
        .delete()
        .eq("id", linkId);
      if (dErr) throw dErr;
      await persistOrder(remaining);
    } catch (err) {
      setError((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Move an item to another item's position, then re-pack. */
  async function reorderTo(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const from = items.findIndex((i) => i.id === sourceId);
    const to = items.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setItems(next.map((it, idx) => ({ ...it, sort_order: idx })));
    await persistOrder(next);
  }

  /**
   * Step an item one slot up or down. Re-packs the whole list by position
   * rather than swapping sort_order values — swapping breaks when two rows
   * share the same number.
   */
  async function move(linkId: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === linkId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;

    const next = [...items];
    [next[idx], next[swap]] = [next[swap], next[idx]];

    setItems(next.map((it, i) => ({ ...it, sort_order: i })));
    await persistOrder(next);
  }

  async function randomizeOrder() {
    if (items.length < 2) return;
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setItems(shuffled.map((it, idx) => ({ ...it, sort_order: idx })));
    await persistOrder(shuffled);
  }

  /**
   * Pointer-based drag. HTML5 drag-and-drop never fires on touch devices, so we
   * drive reordering from pointer events instead — one code path for mouse,
   * trackpad, and finger.
   */
  function handleDragStart(e: React.PointerEvent, linkId: string) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragId(linkId);
    setDragOverId(linkId);
  }

  function handleDragMove(e: React.PointerEvent) {
    if (!dragId) return;
    e.preventDefault();
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-link-id]");
    const overId = el?.dataset.linkId;
    if (overId && overId !== dragOverId) setDragOverId(overId);
  }

  function handleDragEnd(e: React.PointerEvent) {
    if (!dragId) return;
    e.preventDefault();
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    const source = dragId;
    const target = dragOverId;
    setDragId(null);
    setDragOverId(null);
    if (target && target !== source) reorderTo(source, target);
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
                Drag the ⠿ handle to reorder, or use ↑ ↓. This is the slideshow order.
              </p>
              <button
                onClick={randomizeOrder}
                className="btn-secondary sm:hidden text-xs"
                disabled={busy || items.length < 2}
              >
                ⇄ Randomize
              </button>
            </div>

            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mt-3"
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  data-link-id={it.id}
                  className={
                    "card overflow-hidden flex flex-col transition " +
                    (dragId === it.id ? "opacity-40 " : "") +
                    (dragOverId === it.id && dragId && dragId !== it.id
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
                    <button
                      type="button"
                      aria-label="Drag to reorder"
                      onPointerDown={(e) => handleDragStart(e, it.id)}
                      style={{ touchAction: "none" }}
                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-lg bg-black/60 border border-white/10 text-white/80 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-black/80"
                    >
                      ⠿
                    </button>
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
