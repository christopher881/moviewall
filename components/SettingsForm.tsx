"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Collection, Display, DisplayMode, FitMode, Poster, TransitionStyle } from "@/types";

type Props = {
  display: Display;
  collections: Collection[];
  posters: Poster[];
  onSaved?: (d: Display) => void;
};

export default function SettingsForm({ display, collections, posters, onSaved }: Props) {
  const [form, setForm] = useState<Display>(display);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(display);
  }, [display]);

  function update<K extends keyof Display>(key: K, value: Display[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        location: form.location,
        active_collection_id: form.active_collection_id,
        active_poster_id: form.active_poster_id,
        display_mode: form.display_mode,
        rotation_seconds: Math.max(3, Number(form.rotation_seconds) || 30),
        fit_mode: form.fit_mode,
        transition_style: form.transition_style,
        show_overlay: form.show_overlay,
        sleep_enabled: form.sleep_enabled,
        sleep_time: form.sleep_time,
        wake_time: form.wake_time
      };
      const { data, error: uErr } = await supabase
        .from("displays")
        .update(payload)
        .eq("id", display.id)
        .select("*")
        .single();
      if (uErr) throw uErr;
      setSaved(true);
      onSaved?.(data as Display);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card p-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <span className="label">Display name *</span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </div>
        <div>
          <span className="label">Location</span>
          <input
            className="input"
            value={form.location ?? ""}
            onChange={(e) => update("location", e.target.value)}
            placeholder="Living room"
          />
        </div>
      </div>

      <div>
        <span className="label">Display mode</span>
        <div className="flex flex-wrap gap-2">
          {(["single", "collection", "scheduled"] as DisplayMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update("display_mode", m)}
              className={
                "btn px-3 py-1.5 text-xs capitalize " +
                (form.display_mode === m
                  ? "bg-gold-500 text-ink-950"
                  : "bg-ink-700 text-white border border-ink-600 hover:bg-ink-600")
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <span className="label">Active collection</span>
          <select
            className="input"
            value={form.active_collection_id ?? ""}
            onChange={(e) => update("active_collection_id", e.target.value || null)}
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
          <span className="label">Active poster (single mode)</span>
          <select
            className="input"
            value={form.active_poster_id ?? ""}
            onChange={(e) => update("active_poster_id", e.target.value || null)}
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

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <span className="label">Rotation (seconds)</span>
          <input
            className="input"
            type="number"
            min={3}
            value={form.rotation_seconds}
            onChange={(e) => update("rotation_seconds", Number(e.target.value))}
          />
        </div>
        <div>
          <span className="label">Fit mode</span>
          <select
            className="input"
            value={form.fit_mode}
            onChange={(e) => update("fit_mode", e.target.value as FitMode)}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
        </div>
        <div>
          <span className="label">Transition</span>
          <select
            className="input"
            value={form.transition_style}
            onChange={(e) => update("transition_style", e.target.value as TransitionStyle)}
          >
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Toggle
          label="Show poster overlay (title, year, etc.)"
          checked={form.show_overlay}
          onChange={(v) => update("show_overlay", v)}
        />
        <Toggle
          label="Sleep mode"
          checked={form.sleep_enabled}
          onChange={(v) => update("sleep_enabled", v)}
        />
      </div>

      {form.sleep_enabled && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <span className="label">Sleep at</span>
            <input
              className="input"
              type="time"
              value={form.sleep_time ?? ""}
              onChange={(e) => update("sleep_time", e.target.value || null)}
            />
          </div>
          <div>
            <span className="label">Wake at</span>
            <input
              className="input"
              type="time"
              value={form.wake_time ?? ""}
              onChange={(e) => update("wake_time", e.target.value || null)}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="text-teal-300 text-sm bg-teal-500/10 border border-teal-500/30 rounded-xl px-3 py-2">
          Saved. The TV display updates instantly.
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 card p-3 cursor-pointer">
      <span className="text-sm">{label}</span>
      <span
        onClick={() => onChange(!checked)}
        className={
          "relative w-11 h-6 rounded-full transition " +
          (checked ? "bg-gold-500" : "bg-ink-600")
        }
      >
        <span
          className={
            "absolute top-0.5 w-5 h-5 rounded-full bg-white transition " +
            (checked ? "left-5" : "left-0.5")
          }
        />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
