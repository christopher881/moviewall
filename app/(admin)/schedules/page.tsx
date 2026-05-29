"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Collection, Display, Poster, Schedule, ScheduleType } from "@/types";
import { useMobileMenu } from "@/components/AdminLayout";
import TopBar from "@/components/TopBar";
import Modal, { ConfirmModal } from "@/components/Modal";
import ScheduleRuleCard, { DAY_OPTIONS } from "@/components/ScheduleRuleCard";

type FormState = {
  name: string;
  display_id: string;
  schedule_type: ScheduleType;
  collection_id: string;
  poster_id: string;
  day_of_week: string[];
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  display_id: "",
  schedule_type: "weekly",
  collection_id: "",
  poster_id: "",
  day_of_week: [],
  start_time: "",
  end_time: "",
  start_date: "",
  end_date: "",
  active: true
};

export default function SchedulesPage() {
  const { open } = useMobileMenu();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [displays, setDisplays] = useState<Display[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    const [s, d, c, p] = await Promise.all([
      supabase.from("schedules").select("*").order("created_at", { ascending: false }),
      supabase.from("displays").select("*").order("name"),
      supabase.from("collections").select("*").order("name"),
      supabase.from("posters").select("*").order("title")
    ]);
    if (s.error || d.error || c.error || p.error) {
      setError(s.error?.message || d.error?.message || c.error?.message || p.error?.message || "Load failed");
    } else {
      setSchedules((s.data ?? []) as Schedule[]);
      setDisplays((d.data ?? []) as Display[]);
      setCollections((c.data ?? []) as Collection[]);
      setPosters((p.data ?? []) as Poster[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("schedules-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, display_id: displays[0]?.id ?? "" });
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(s: Schedule) {
    setForm({
      name: s.name,
      display_id: s.display_id,
      schedule_type: (s.schedule_type ?? "weekly") as ScheduleType,
      collection_id: s.collection_id ?? "",
      poster_id: s.poster_id ?? "",
      day_of_week: s.day_of_week ? s.day_of_week.split(",").filter(Boolean) : [],
      start_time: s.start_time ?? "",
      end_time: s.end_time ?? "",
      start_date: s.start_date ?? "",
      end_date: s.end_date ?? "",
      active: s.active
    });
    setEditing(s);
    setEditorOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.display_id) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        display_id: form.display_id,
        schedule_type: form.schedule_type,
        collection_id: form.collection_id || null,
        poster_id: form.poster_id || null,
        day_of_week:
          form.schedule_type === "weekly" && form.day_of_week.length
            ? form.day_of_week.join(",")
            : null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        start_date: form.schedule_type === "date_range" ? form.start_date || null : null,
        end_date: form.schedule_type === "date_range" ? form.end_date || null : null,
        active: form.active
      };
      if (editing) {
        const { error: uErr } = await supabase
          .from("schedules")
          .update(payload)
          .eq("id", editing.id);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await supabase.from("schedules").insert(payload);
        if (iErr) throw iErr;
      }
      setEditorOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: Schedule) {
    await supabase.from("schedules").update({ active: !s.active }).eq("id", s.id);
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const { error: dErr } = await supabase
        .from("schedules")
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

  function toggleDay(d: string) {
    setForm((f) =>
      f.day_of_week.includes(d)
        ? { ...f, day_of_week: f.day_of_week.filter((x) => x !== d) }
        : { ...f, day_of_week: [...f.day_of_week, d] }
    );
  }

  return (
    <>
      <TopBar
        title="Schedules"
        subtitle="Rules for what plays, when"
        onMenu={open}
        actions={
          <button onClick={openCreate} className="btn-primary" disabled={displays.length === 0}>
            + New rule
          </button>
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        {error && (
          <div className="card p-4 border-red-500/40 text-red-300">{error}</div>
        )}

        {displays.length === 0 && (
          <div className="card p-6 text-zinc-400">
            Create a display first to start scheduling.
          </div>
        )}

        {loading ? (
          <div className="card p-8 text-center text-zinc-500">Loading…</div>
        ) : schedules.length === 0 ? (
          <div className="card p-12 text-center space-y-3">
            <p className="text-zinc-400">No rules yet. Examples to build:</p>
            <ul className="text-sm text-zinc-500 space-y-1">
              <li>· Friday night → Family Movie Night collection</li>
              <li>· October → Halloween collection</li>
              <li>· December → Christmas collection</li>
              <li>· After 11 PM → enable sleep mode</li>
            </ul>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((s) => (
              <ScheduleRuleCard
                key={s.id}
                schedule={s}
                display={displays.find((d) => d.id === s.display_id)}
                collection={collections.find((c) => c.id === s.collection_id)}
                poster={posters.find((p) => p.id === s.poster_id)}
                onToggle={toggleActive}
                onEdit={openEdit}
                onDelete={(x) => setConfirmDelete(x)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit schedule" : "New schedule"}
        size="lg"
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className="label">Name *</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Friday Movie Night"
                required
              />
            </div>
            <div>
              <span className="label">Display *</span>
              <select
                className="input"
                value={form.display_id}
                onChange={(e) => setForm((f) => ({ ...f, display_id: e.target.value }))}
                required
              >
                <option value="">— pick one —</option>
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="label">Rule type</span>
            <div className="flex flex-wrap gap-2">
              {(["weekly", "date_range", "daily_time"] as ScheduleType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, schedule_type: t }))}
                  className={
                    "btn px-3 py-1.5 text-xs " +
                    (form.schedule_type === t
                      ? "bg-gold-500 text-ink-950"
                      : "bg-ink-700 text-white border border-ink-600 hover:bg-ink-600")
                  }
                >
                  {t === "weekly" ? "Weekly" : t === "date_range" ? "Date range" : "Daily time"}
                </button>
              ))}
            </div>
          </div>

          {form.schedule_type === "weekly" && (
            <div>
              <span className="label">Days</span>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDay(d.v)}
                    className={
                      "btn px-3 py-1.5 text-xs " +
                      (form.day_of_week.includes(d.v)
                        ? "bg-teal-500 text-ink-950"
                        : "bg-ink-700 text-white border border-ink-600 hover:bg-ink-600")
                    }
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.schedule_type === "date_range" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <span className="label">Start date</span>
                <input
                  type="date"
                  className="input"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <span className="label">End date</span>
                <input
                  type="date"
                  className="input"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className="label">Start time</span>
              <input
                type="time"
                className="input"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div>
              <span className="label">End time</span>
              <input
                type="time"
                className="input"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className="label">Collection to play</span>
              <select
                className="input"
                value={form.collection_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, collection_id: e.target.value, poster_id: "" }))
                }
              >
                <option value="">— none —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">Or single poster</span>
              <select
                className="input"
                value={form.poster_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, poster_id: e.target.value, collection_id: "" }))
                }
              >
                <option value="">— none —</option>
                {posters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditorOpen(false);
                setEditing(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save" : "Create rule"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Delete schedule?"
        body={<span>"{confirmDelete?.name}" will be removed.</span>}
        confirmLabel="Delete"
        danger
        busy={busy}
      />
    </>
  );
}
