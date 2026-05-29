"use client";

import { Poster } from "@/types";

export default function PosterCard({
  poster,
  onEdit,
  onDelete,
  onAddToCollection,
  onSetActive
}: {
  poster: Poster;
  onEdit?: (p: Poster) => void;
  onDelete?: (p: Poster) => void;
  onAddToCollection?: (p: Poster) => void;
  onSetActive?: (p: Poster) => void;
}) {
  return (
    <div className="card card-hover overflow-hidden flex flex-col">
      <div className="relative aspect-[2/3] bg-ink-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster.image_url}
          alt={poster.title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute top-2 left-2 flex gap-1">
          {poster.active ? (
            <span className="badge-active">Active</span>
          ) : (
            <span className="badge-inactive">Inactive</span>
          )}
          {!poster.year && !poster.rating && !poster.runtime && !poster.genre && !poster.description && (
            <span className="badge bg-gold-500/15 text-gold-400 border border-gold-500/30">
              Needs info
            </span>
          )}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-1">
        <p className="font-medium truncate" title={poster.title}>
          {poster.title}
        </p>
        <p className="text-xs text-zinc-400 flex gap-2 truncate">
          {poster.year && <span>{poster.year}</span>}
          {poster.rating && <span>· {poster.rating}</span>}
          {poster.runtime && <span>· {poster.runtime}</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 px-2 pb-2">
        {onEdit && (
          <button onClick={() => onEdit(poster)} className="btn-ghost text-xs px-2 py-1">
            Edit
          </button>
        )}
        {onAddToCollection && (
          <button
            onClick={() => onAddToCollection(poster)}
            className="btn-ghost text-xs px-2 py-1"
          >
            + Collection
          </button>
        )}
        {onSetActive && (
          <button
            onClick={() => onSetActive(poster)}
            className="btn-ghost text-xs px-2 py-1 text-gold"
          >
            Set live
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(poster)}
            className="btn-ghost text-xs px-2 py-1 text-red-400 ml-auto"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
