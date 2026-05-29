"use client";

import { useState } from "react";
import { POSTER_BUCKET, supabase } from "@/lib/supabaseClient";
import { Poster } from "@/types";
import { fileExt, randomId } from "@/lib/utils";

type FormState = {
  title: string;
  year: string;
  rating: string;
  runtime: string;
  genre: string;
  description: string;
};

const empty: FormState = {
  title: "",
  year: "",
  rating: "",
  runtime: "",
  genre: "",
  description: ""
};

const ALLOWED = ["jpg", "jpeg", "png", "webp"];

export default function PosterUploadForm({
  poster,
  onSaved,
  onCancel
}: {
  poster?: Poster | null;
  onSaved: (p: Poster) => void;
  onCancel: () => void;
}) {
  const editing = !!poster;
  const [form, setForm] = useState<FormState>({
    title: poster?.title ?? "",
    year: poster?.year ?? "",
    rating: poster?.rating ?? "",
    runtime: poster?.runtime ?? "",
    genre: poster?.genre ?? "",
    description: poster?.description ?? ""
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(poster?.image_url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function pick(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      setPreview(poster?.image_url ?? null);
      return;
    }
    const ext = fileExt(f.name);
    if (!ALLOWED.includes(ext)) {
      setError("Only JPG, PNG, or WEBP images are supported.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError("Image must be 25MB or smaller.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!editing && !file) {
      setError("Please choose a poster image.");
      return;
    }

    setBusy(true);
    try {
      let image_url = poster?.image_url ?? "";
      let storage_path = poster?.storage_path ?? null;

      if (file) {
        setProgress("Uploading image…");
        const ext = fileExt(file.name);
        const path = `posters/${randomId()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(POSTER_BUCKET)
          .upload(path, file, {
            cacheControl: "31536000",
            upsert: false,
            contentType: file.type
          });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(POSTER_BUCKET).getPublicUrl(path);
        image_url = pub.publicUrl;
        storage_path = path;
      }

      setProgress("Saving record…");
      const payload = {
        title: form.title.trim(),
        year: form.year.trim() || null,
        rating: form.rating.trim() || null,
        runtime: form.runtime.trim() || null,
        genre: form.genre.trim() || null,
        description: form.description.trim() || null,
        image_url,
        storage_path
      };

      let saved: Poster | null = null;
      if (editing && poster) {
        const { data, error: sErr } = await supabase
          .from("posters")
          .update(payload)
          .eq("id", poster.id)
          .select("*")
          .single();
        if (sErr) throw sErr;
        saved = data as Poster;

        // If we replaced the image, clean up the old one.
        if (file && poster.storage_path && poster.storage_path !== storage_path) {
          await supabase.storage.from(POSTER_BUCKET).remove([poster.storage_path]);
        }
      } else {
        const { data, error: iErr } = await supabase
          .from("posters")
          .insert({ ...payload, active: true })
          .select("*")
          .single();
        if (iErr) throw iErr;
        saved = data as Poster;
      }

      if (saved) onSaved(saved);
    } catch (err) {
      setError((err as Error).message ?? "Something went wrong.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid sm:grid-cols-[180px_1fr] gap-4">
        <label className="block cursor-pointer">
          <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-ink-900 border border-dashed border-ink-600 flex items-center justify-center">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-zinc-500 text-center px-2">
                Click to choose<br />JPG · PNG · WEBP
              </span>
            )}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-zinc-500 mt-2 text-center">
            {file ? file.name : editing ? "Replace image (optional)" : "Choose image"}
          </p>
        </label>

        <div className="space-y-3">
          <div>
            <span className="label">Title *</span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="The Grand Budapest Hotel"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="label">Year</span>
              <input
                className="input"
                value={form.year}
                onChange={(e) => update("year", e.target.value)}
                placeholder="2014"
              />
            </div>
            <div>
              <span className="label">Rating</span>
              <input
                className="input"
                value={form.rating}
                onChange={(e) => update("rating", e.target.value)}
                placeholder="R"
              />
            </div>
            <div>
              <span className="label">Runtime</span>
              <input
                className="input"
                value={form.runtime}
                onChange={(e) => update("runtime", e.target.value)}
                placeholder="99 min"
              />
            </div>
          </div>
          <div>
            <span className="label">Genre</span>
            <input
              className="input"
              value={form.genre}
              onChange={(e) => update("genre", e.target.value)}
              placeholder="Comedy · Drama"
            />
          </div>
          <div>
            <span className="label">Description</span>
            <textarea
              className="input min-h-[80px]"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="A writer encounters the owner of an aging high-class hotel…"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {progress && !error && (
        <div className="text-zinc-300 text-sm bg-ink-800 border border-ink-700 rounded-xl px-3 py-2">
          {progress}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Upload poster"}
        </button>
      </div>
    </form>
  );
}
