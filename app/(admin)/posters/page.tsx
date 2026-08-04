"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { POSTER_BUCKET, supabase } from "@/lib/supabaseClient";
import { Collection, Display, Poster } from "@/types";
import { useMobileMenu } from "@/components/AdminLayout";
import TopBar from "@/components/TopBar";
import PosterCard from "@/components/PosterCard";
import PosterUploadForm from "@/components/PosterUploadForm";
import PosterBulkUploadForm from "@/components/PosterBulkUploadForm";
import Modal, { ConfirmModal } from "@/components/Modal";

export default function PostersPage() {
  const { open } = useMobileMenu();
  const [posters, setPosters] = useState<Poster[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editPoster, setEditPoster] = useState<Poster | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Poster | null>(null);
  const [addToCollectionFor, setAddToCollectionFor] = useState<Poster | null>(null);
  const [setActiveFor, setSetActiveFor] = useState<Poster | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCollectionOpen, setBulkCollectionOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = useCallback(async () => {
    const [p, c, d] = await Promise.all([
      supabase.from("posters").select("*").order("created_at", { ascending: false }),
      supabase.from("collections").select("*").order("name"),
      supabase.from("displays").select("*").order("name")
    ]);
    if (p.error || c.error || d.error) {
      setError(p.error?.message || c.error?.message || d.error?.message || "Load failed");
    } else {
      setPosters((p.data ?? []) as Poster[]);
      setCollections((c.data ?? []) as Collection[]);
      setDisplays((d.data ?? []) as Display[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("posters-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "posters" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posters;
    return posters.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.genre ?? "").toLowerCase().includes(q) ||
        (p.year ?? "").toLowerCase().includes(q)
    );
  }, [posters, query]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      if (confirmDelete.storage_path) {
        await supabase.storage.from(POSTER_BUCKET).remove([confirmDelete.storage_path]);
      }
      const { error: dErr } = await supabase
        .from("posters")
        .delete()
        .eq("id", confirmDelete.id);
      if (dErr) throw dErr;
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addPosterToCollection(posterId: string, collectionId: string) {
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from("collection_posters")
        .select("id")
        .eq("collection_id", collectionId)
        .eq("poster_id", posterId)
        .maybeSingle();
      if (existing) {
        setAddToCollectionFor(null);
        return;
      }
      const { data: max } = await supabase
        .from("collection_posters")
        .select("sort_order")
        .eq("collection_id", collectionId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextSort = (max?.[0]?.sort_order ?? -1) + 1;
      const { error: iErr } = await supabase
        .from("collection_posters")
        .insert({ collection_id: collectionId, poster_id: posterId, sort_order: nextSort });
      if (iErr) throw iErr;
      setAddToCollectionFor(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(p: Poster) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkAddToCollection(collectionId: string) {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const { data: existing } = await supabase
        .from("collection_posters")
        .select("poster_id")
        .eq("collection_id", collectionId)
        .in("poster_id", ids);
      const already = new Set((existing ?? []).map((r) => r.poster_id as string));
      const toAdd = ids.filter((id) => !already.has(id));
      if (toAdd.length === 0) {
        setBulkCollectionOpen(false);
        exitSelectMode();
        return;
      }

      const { data: max } = await supabase
        .from("collection_posters")
        .select("sort_order")
        .eq("collection_id", collectionId)
        .order("sort_order", { ascending: false })
        .limit(1);
      let nextSort = (max?.[0]?.sort_order ?? -1) + 1;

      const rows = toAdd.map((posterId) => ({
        collection_id: collectionId,
        poster_id: posterId,
        sort_order: nextSort++
      }));
      const { error: iErr } = await supabase.from("collection_posters").insert(rows);
      if (iErr) throw iErr;

      setBulkCollectionOpen(false);
      exitSelectMode();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const targets = posters.filter((p) => selectedIds.has(p.id));
      const paths = targets
        .map((p) => p.storage_path)
        .filter((p): p is string => !!p);
      if (paths.length > 0) {
        await supabase.storage.from(POSTER_BUCKET).remove(paths);
      }
      const { error: dErr } = await supabase.from("posters").delete().in("id", ids);
      if (dErr) throw dErr;
      setConfirmBulkDelete(false);
      exitSelectMode();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkSetActive(active: boolean) {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const { error: uErr } = await supabase
        .from("posters")
        .update({ active })
        .in("id", Array.from(selectedIds));
      if (uErr) throw uErr;
      exitSelectMode();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setAsActiveOnDisplay(posterId: string, displayId: string) {
    setBusy(true);
    try {
      const { error: uErr } = await supabase
        .from("displays")
        .update({
          active_poster_id: posterId,
          display_mode: "single"
        })
        .eq("id", displayId);
      if (uErr) throw uErr;
      setSetActiveFor(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title="Poster Library"
        subtitle={`${posters.length} poster${posters.length === 1 ? "" : "s"}`}
        onMenu={open}
        actions={
          selectMode ? (
            <>
              <button
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === filtered.length
                      ? new Set()
                      : new Set(filtered.map((p) => p.id))
                  )
                }
                className="btn-ghost"
              >
                {selectedIds.size === filtered.length ? "Clear" : "All"}
              </button>
              <button onClick={exitSelectMode} className="btn-secondary">
                Done
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectMode(true)}
                className="btn-ghost hidden sm:inline-flex"
                disabled={posters.length === 0}
              >
                Select
              </button>
              <button
                onClick={() => setBulkOpen(true)}
                className="btn-secondary hidden sm:inline-flex"
              >
                + Bulk
              </button>
              <button onClick={() => setUploadOpen(true)} className="btn-primary">
                + Upload
              </button>
            </>
          )
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        {error && (
          <div className="card p-4 border-red-500/40 text-red-300">{error}</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-md flex-1 min-w-[200px]"
            placeholder="Search title, genre, year…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={() => setBulkOpen(true)}
            className="btn-secondary sm:hidden"
          >
            + Bulk upload
          </button>
          {!selectMode && (
            <button
              onClick={() => setSelectMode(true)}
              className="btn-secondary sm:hidden"
              disabled={posters.length === 0}
            >
              Select
            </button>
          )}
        </div>

        {loading ? (
          <div className="card p-8 text-center text-zinc-500">Loading posters…</div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-zinc-400 mb-3">
              {posters.length === 0
                ? "Your library is empty."
                : "No posters match your search."}
            </p>
            {posters.length === 0 && (
              <button onClick={() => setUploadOpen(true)} className="btn-primary">
                Upload your first poster
              </button>
            )}
          </div>
        ) : (
          <div
            className={
              "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4" +
              (selectMode && selectedIds.size > 0 ? " pb-24" : "")
            }
          >
            {filtered.map((p) => (
              <PosterCard
                key={p.id}
                poster={p}
                selectMode={selectMode}
                selected={selectedIds.has(p.id)}
                onToggleSelect={toggleSelect}
                onEdit={(x) => setEditPoster(x)}
                onDelete={(x) => setConfirmDelete(x)}
                onAddToCollection={(x) => setAddToCollectionFor(x)}
                onSetActive={(x) => setSetActiveFor(x)}
              />
            ))}
          </div>
        )}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-3 sm:p-4 bg-ink-900/95 backdrop-blur border-t border-ink-700">
          <div className="flex flex-wrap items-center gap-2 max-w-5xl mx-auto">
            <span className="text-sm text-zinc-300 mr-auto">
              {selectedIds.size} selected
            </span>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => setBulkCollectionOpen(true)}
            >
              + Add to collection
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => bulkSetActive(true)}
            >
              Activate
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => bulkSetActive(false)}
            >
              Deactivate
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => setConfirmBulkDelete(true)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <Modal
        open={uploadOpen || !!editPoster}
        onClose={() => {
          setUploadOpen(false);
          setEditPoster(null);
        }}
        title={editPoster ? "Edit poster" : "Upload poster"}
        size="lg"
      >
        <PosterUploadForm
          poster={editPoster}
          onSaved={() => {
            setUploadOpen(false);
            setEditPoster(null);
            load();
          }}
          onCancel={() => {
            setUploadOpen(false);
            setEditPoster(null);
          }}
        />
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk upload posters"
        size="lg"
      >
        <PosterBulkUploadForm
          onDone={(n) => {
            if (n > 0) load();
            // keep the modal open so the user can see which ones failed
          }}
          onCancel={() => setBulkOpen(false)}
        />
      </Modal>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete poster?"
        body={
          <>
            <span className="font-medium">{confirmDelete?.title}</span> will be removed
            from your library and any collections.
          </>
        }
        confirmLabel="Delete"
        danger
        busy={busy}
      />

      <Modal
        open={!!addToCollectionFor}
        onClose={() => setAddToCollectionFor(null)}
        title={`Add "${addToCollectionFor?.title}" to a collection`}
      >
        {collections.length === 0 ? (
          <p className="text-sm text-zinc-400">
            You don&apos;t have any collections yet. Create one from the Collections page.
          </p>
        ) : (
          <div className="space-y-2">
            {collections.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                onClick={() =>
                  addToCollectionFor && addPosterToCollection(addToCollectionFor.id, c.id)
                }
                className="w-full text-left card card-hover p-3 flex items-center justify-between"
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.description && (
                    <span className="block text-xs text-zinc-400">{c.description}</span>
                  )}
                </span>
                <span className="text-gold">+</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={bulkCollectionOpen}
        onClose={() => setBulkCollectionOpen(false)}
        title={`Add ${selectedIds.size} poster${selectedIds.size === 1 ? "" : "s"} to…`}
      >
        {collections.length === 0 ? (
          <p className="text-sm text-zinc-400">
            You don&apos;t have any collections yet. Create one from the Collections page.
          </p>
        ) : (
          <div className="space-y-2">
            {collections.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                onClick={() => bulkAddToCollection(c.id)}
                className="w-full text-left card card-hover p-3 flex items-center justify-between"
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.description && (
                    <span className="block text-xs text-zinc-400">{c.description}</span>
                  )}
                </span>
                <span className="text-gold">+</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={bulkDelete}
        title={`Delete ${selectedIds.size} poster${selectedIds.size === 1 ? "" : "s"}?`}
        body="They'll be removed from your library, any collections, and Supabase Storage."
        confirmLabel="Delete all"
        danger
        busy={busy}
      />

      <Modal
        open={!!setActiveFor}
        onClose={() => setSetActiveFor(null)}
        title={`Set "${setActiveFor?.title}" live on…`}
      >
        {displays.length === 0 ? (
          <p className="text-sm text-zinc-400">No displays yet. Create one first.</p>
        ) : (
          <div className="space-y-2">
            {displays.map((d) => (
              <button
                key={d.id}
                disabled={busy}
                onClick={() => setActiveFor && setAsActiveOnDisplay(setActiveFor.id, d.id)}
                className="w-full text-left card card-hover p-3 flex items-center justify-between"
              >
                <span>
                  <span className="font-medium">{d.name}</span>
                  {d.location && (
                    <span className="block text-xs text-zinc-400">{d.location}</span>
                  )}
                </span>
                <span className="text-gold">→</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
