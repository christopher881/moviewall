"use client";

import { useRef, useState } from "react";
import { POSTER_BUCKET, supabase } from "@/lib/supabaseClient";
import { Poster } from "@/types";
import { fileExt, randomId } from "@/lib/utils";
import { isPdfFile, pdfFirstPageToImage } from "@/lib/pdf";

const ALLOWED = ["jpg", "jpeg", "png", "webp", "pdf"];

type Status = "converting" | "queued" | "uploading" | "done" | "error";

type Item = {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  status: Status;
  error?: string;
};

/**
 * Turn a filename like "the-grand-budapest-hotel.jpg" into "The Grand Budapest Hotel".
 */
function titleFromFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  return base
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default function PosterBulkUploadForm({
  onDone,
  onCancel
}: {
  onDone: (count: number) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setGlobalError(null);
    const next: Item[] = [];
    const pdfsToConvert: { id: string; file: File }[] = [];

    Array.from(files).forEach((f) => {
      const ext = fileExt(f.name);
      if (!ALLOWED.includes(ext)) {
        next.push({
          id: randomId(),
          file: f,
          previewUrl: "",
          title: f.name,
          status: "error",
          error: "Unsupported format"
        });
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        next.push({
          id: randomId(),
          file: f,
          previewUrl: "",
          title: f.name,
          status: "error",
          error: "Larger than 25MB"
        });
        return;
      }

      const id = randomId();

      if (isPdfFile(f)) {
        next.push({
          id,
          file: f,
          previewUrl: "",
          title: titleFromFilename(f.name),
          status: "converting"
        });
        pdfsToConvert.push({ id, file: f });
        return;
      }

      next.push({
        id,
        file: f,
        previewUrl: URL.createObjectURL(f),
        title: titleFromFilename(f.name),
        status: "queued"
      });
    });

    setItems((prev) => [...prev, ...next]);

    // Kick off PDF conversions in the background; update each item when done.
    pdfsToConvert.forEach(async ({ id, file }) => {
      try {
        const img = await pdfFirstPageToImage(file);
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  file: img,
                  previewUrl: URL.createObjectURL(img),
                  status: "queued"
                }
              : it
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? { ...it, status: "error", error: (err as Error).message }
              : it
          )
        );
      }
    });
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function updateTitle(id: string, title: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
  }

  function setStatus(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function uploadOne(item: Item): Promise<Poster | null> {
    if (item.status === "error") return null;
    setStatus(item.id, { status: "uploading", error: undefined });
    try {
      const ext = fileExt(item.file.name);
      const path = `posters/${randomId()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(POSTER_BUCKET)
        .upload(path, item.file, {
          cacheControl: "31536000",
          upsert: false,
          contentType: item.file.type
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(POSTER_BUCKET).getPublicUrl(path);

      const { data, error: iErr } = await supabase
        .from("posters")
        .insert({
          title: item.title.trim() || "Untitled",
          image_url: pub.publicUrl,
          storage_path: path,
          active: true
        })
        .select("*")
        .single();
      if (iErr) throw iErr;

      setStatus(item.id, { status: "done" });
      return data as Poster;
    } catch (err) {
      setStatus(item.id, { status: "error", error: (err as Error).message ?? "Upload failed" });
      return null;
    }
  }

  async function startUpload() {
    setBusy(true);
    setGlobalError(null);
    try {
      const queued = items.filter((it) => it.status === "queued" || it.status === "error");
      // Upload 3 at a time so the network and Supabase aren't hammered.
      const concurrency = 3;
      let i = 0;
      const created: Poster[] = [];
      async function worker() {
        while (i < queued.length) {
          const myIdx = i++;
          const result = await uploadOne(queued[myIdx]);
          if (result) created.push(result);
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker));
      onDone(created.length);
    } catch (err) {
      setGlobalError((err as Error).message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const total = items.length;
  const done = items.filter((it) => it.status === "done").length;
  const errored = items.filter((it) => it.status === "error").length;
  const stillConverting = items.some((it) => it.status === "converting");
  const uploadableCount = items.filter(
    (it) => it.status === "queued" || it.status === "error"
  ).length;

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-ink-600 rounded-2xl p-8 text-center cursor-pointer hover:border-gold-500 transition"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          addFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-zinc-300">
          Drop poster images here, or <span className="text-gold underline">click to choose</span>
        </p>
        <p className="text-xs text-zinc-500 mt-1">JPG · PNG · WEBP · PDF · up to 25 MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 card p-2"
            >
              <div className="relative w-12 h-16 rounded-md overflow-hidden bg-ink-900 shrink-0">
                {it.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.previewUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <input
                  className="input text-sm py-1"
                  value={it.title}
                  onChange={(e) => updateTitle(it.id, e.target.value)}
                  disabled={busy || it.status === "done"}
                  placeholder="Title"
                />
                <p className="text-xs text-zinc-500 truncate mt-1">{it.file.name}</p>
                {it.error && (
                  <p className="text-xs text-red-400 mt-0.5">{it.error}</p>
                )}
              </div>
              <div className="text-xs w-20 text-right shrink-0">
                {it.status === "converting" && <span className="text-zinc-400 animate-pulse">Converting…</span>}
                {it.status === "queued" && <span className="text-zinc-500">Ready</span>}
                {it.status === "uploading" && <span className="text-gold">Uploading…</span>}
                {it.status === "done" && <span className="text-teal-400">Done ✓</span>}
                {it.status === "error" && <span className="text-red-400">Failed</span>}
              </div>
              {!busy && it.status !== "done" && (
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="text-zinc-500 hover:text-red-400 text-sm px-1 shrink-0"
                  aria-label="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {globalError && (
        <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          {globalError}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-ink-700">
        <p className="text-xs text-zinc-500">
          {total === 0
            ? "Nothing queued yet."
            : busy
            ? `${done} done, ${errored} failed, ${total - done - errored} in progress…`
            : `${total} file${total === 1 ? "" : "s"} ready`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={busy ? undefined : onCancel}
            disabled={busy}
          >
            {done > 0 ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={
              busy ||
              stillConverting ||
              items.length === 0 ||
              uploadableCount === 0
            }
            onClick={startUpload}
          >
            {busy
              ? "Uploading…"
              : stillConverting
              ? "Converting PDFs…"
              : done > 0 && done < total
              ? "Retry remaining"
              : `Upload ${uploadableCount} poster${uploadableCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Don&apos;t worry about year, rating, genre, etc. — uploaded posters land in your library
        with placeholders. Click <b>Edit</b> on any card later to fill in the details.
      </p>
    </div>
  );
}
