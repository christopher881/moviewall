"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Collection, CollectionPoster, Display, Poster } from "@/types";
import { useMobileMenu } from "@/components/AdminLayout";
import TopBar from "@/components/TopBar";
import CollectionCard from "@/components/CollectionCard";
import Modal, { ConfirmModal } from "@/components/Modal";

export default function CollectionsPage() {
  const { open } = useMobileMenu();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [links, setLinks] = useState<CollectionPoster[]>([]);
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Collection | null>(null);
  const [sendingTo, setSendingTo] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: "", description: "", active: true });

  const load = useCallback(async () => {
    const [c, p, l, d] = await Promise.all([
      supabase.from("collections").select("*").order("created_at", { ascending: false }),
      supabase.from("posters").select("*"),
      supabase.from("collection_posters").select("*").order("sort_order"),
      supabase.from("displays").select("*").order("name")
    ]);
    if (c.error || p.error || l.error || d.error) {
      setError(
        c.error?.message || p.error?.message || l.error?.message || d.error?.message || "Load failed"
      );
    } else {
      setCollections((c.data ?? []) as Collection[]);
      setPosters((p.data ?? []) as Poster[]);
      setLinks((l.data ?? []) as CollectionPoster[]);
      setDisplays((d.data ?? []) as Display[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("collections-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "collection_posters" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "posters" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const postersByCollection = useMemo(() => {
    const map = new Map<string, Poster[]>();
    const posterMap = new Map(posters.map((p) => [p.id, p]));
    for (const link of links) {
      const arr = map.get(link.collection_id) ?? [];
      const p = posterMap.get(link.poster_id);
      if (p) arr.push(p);
      map.set(link.collection_id, arr);
    }
    return map;
  }, [posters, links]);

  function openCreate() {
    setForm({ name: "", description: "", active: true });
    setEditing(null);
    setCreateOpen(true);
  }
  function openEdit(c: Collection) {
    setForm({ name: c.name, description: c.description ?? "", active: c.active });
    setEditing(c);
    setCreateOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        active: form.active
      };
      if (editing) {
        const { error: uErr } = await supabase
          .from("collections")
          .update(payload)
          .eq("id", editing.id);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await supabase.from("collections").insert(payload);
        if (iErr) throw iErr;
      }
      setCreateOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const { error: dErr } = await supabase
        .from("collections")
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

  async function sendToDisplay(displayId: string) {
    if (!sendingTo) return;
    setBusy(true);
    try {
      const { error: uErr } = await supabase
        .from("displays")
        .update({
          active_collection_id: sendingTo.id,
          display_mode: "collection"
        })
        .eq("id", displayId);
      if (uErr) throw uErr;
      setSendingTo(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title="Collections"
        subtitle="Group posters into themed playlists"
        onMenu={open}
        actions={
          <button onClick={openCreate} className="btn-primary">
            + New collection
          </button>
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        {error && (
          <div className="card p-4 border-red-500/40 text-red-300">{error}</div>
        )}
        {loading ? (
          <div className="card p-8 text-center text-zinc-500">Loading…</div>
        ) : collections.length === 0 ? (
          <div className="card p-12 text-center space-y-4">
            <p className="text-zinc-400">Try one of these to get started:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {["Halloween", "Christmas", "Marvel", "Star Wars", "Disney", "Sci-Fi", "Family Movie Night", "Date Night"].map(
                (name) => (
                  <button
                    key={name}
                    onClick={() => {
                      setForm({ name, description: "", active: true });
                      setEditing(null);
                      setCreateOpen(true);
                    }}
                    className="btn-secondary text-xs"
                  >
                    + {name}
                  </button>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((c) => (
              <CollectionCard
                key={c.id}
                collection={c}
                count={postersByCollection.get(c.id)?.length ?? 0}
                previewPosters={postersByCollection.get(c.id) ?? []}
                onSetActive={(x) => setSendingTo(x)}
                onEdit={openEdit}
                onDelete={(x) => setConfirmDelete(x)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit collection" : "New collection"}
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <span className="label">Name *</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Halloween"
              required
            />
          </div>
          <div>
            <span className="label">Description</span>
            <textarea
              className="input min-h-[80px]"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Spooky season classics"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Delete collection?"
        body={
          <>
            <span className="font-medium">{confirmDelete?.name}</span> will be removed.
            The posters themselves stay in your library.
          </>
        }
        confirmLabel="Delete"
        danger
        busy={busy}
      />

      <Modal
        open={!!sendingTo}
        onClose={() => setSendingTo(null)}
        title={`Send "${sendingTo?.name}" to…`}
      >
        {displays.length === 0 ? (
          <p className="text-sm text-zinc-400">No displays yet.</p>
        ) : (
          <div className="space-y-2">
            {displays.map((d) => (
              <button
                key={d.id}
                disabled={busy}
                onClick={() => sendToDisplay(d.id)}
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
