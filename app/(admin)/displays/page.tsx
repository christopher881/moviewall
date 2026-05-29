"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Collection, Display, Poster } from "@/types";
import { useMobileMenu } from "@/components/AdminLayout";
import TopBar from "@/components/TopBar";
import DisplayStatusCard from "@/components/DisplayStatusCard";
import Modal, { ConfirmModal } from "@/components/Modal";

export default function DisplaysPage() {
  const { open } = useMobileMenu();
  const [displays, setDisplays] = useState<Display[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Display | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", location: "" });

  const load = useCallback(async () => {
    const [d, c, p] = await Promise.all([
      supabase.from("displays").select("*").order("created_at"),
      supabase.from("collections").select("*").order("name"),
      supabase.from("posters").select("*").order("title")
    ]);
    if (d.error || c.error || p.error) {
      setError(d.error?.message || c.error?.message || p.error?.message || "Load failed");
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
      .channel("displays-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "displays" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  async function createDisplay(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { error: iErr } = await supabase
        .from("displays")
        .insert({
          name: form.name.trim(),
          location: form.location.trim() || null,
          display_mode: "collection",
          rotation_seconds: 30,
          fit_mode: "cover",
          transition_style: "fade",
          show_overlay: false,
          sleep_enabled: false
        });
      if (iErr) throw iErr;
      setCreateOpen(false);
      setForm({ name: "", location: "" });
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
        .from("displays")
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

  return (
    <>
      <TopBar
        title="Displays"
        subtitle="The TVs that play your posters"
        onMenu={open}
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            + New display
          </button>
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        {error && (
          <div className="card p-4 border-red-500/40 text-red-300">{error}</div>
        )}

        {loading ? (
          <div className="card p-8 text-center text-zinc-500">Loading…</div>
        ) : displays.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-zinc-400 mb-3">
              Add a display to get a URL you can open on your TV.
            </p>
            <button onClick={() => setCreateOpen(true)} className="btn-primary">
              + Create display
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displays.map((d) => (
              <div key={d.id} className="space-y-2">
                <DisplayStatusCard
                  display={d}
                  collection={collections.find((c) => c.id === d.active_collection_id)}
                  poster={posters.find((p) => p.id === d.active_poster_id)}
                />
                <div className="flex justify-between gap-2 px-1">
                  <Link href={`/displays/${d.id}`} className="text-sm text-zinc-400 hover:text-white">
                    Open settings →
                  </Link>
                  <button
                    onClick={() => setConfirmDelete(d)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New display">
        <form onSubmit={createDisplay} className="space-y-3">
          <div>
            <span className="label">Name *</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Hallway TV"
              required
            />
          </div>
          <div>
            <span className="label">Location</span>
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Upstairs hallway"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCreateOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Delete display?"
        body={
          <>
            <span className="font-medium">{confirmDelete?.name}</span> and its schedules
            will be removed.
          </>
        }
        confirmLabel="Delete"
        danger
        busy={busy}
      />
    </>
  );
}
