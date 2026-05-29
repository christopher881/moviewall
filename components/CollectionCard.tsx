"use client";

import Link from "next/link";
import { Collection, Poster } from "@/types";

export default function CollectionCard({
  collection,
  count,
  previewPosters,
  onSetActive,
  onEdit,
  onDelete
}: {
  collection: Collection;
  count: number;
  previewPosters: Poster[];
  onSetActive?: (c: Collection) => void;
  onEdit?: (c: Collection) => void;
  onDelete?: (c: Collection) => void;
}) {
  const previews = previewPosters.slice(0, 4);
  return (
    <div className="card card-hover overflow-hidden flex flex-col">
      <Link
        href={`/collections/${collection.id}`}
        className="grid grid-cols-2 gap-px bg-ink-700 aspect-[2/1]"
      >
        {Array.from({ length: 4 }).map((_, i) => {
          const p = previews[i];
          return (
            <div key={i} className="relative bg-ink-900 overflow-hidden">
              {p ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>
          );
        })}
      </Link>

      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{collection.name}</h3>
            <p className="text-xs text-zinc-400">
              {count} poster{count === 1 ? "" : "s"}
            </p>
          </div>
          {collection.active ? (
            <span className="badge-active">Active</span>
          ) : (
            <span className="badge-inactive">Inactive</span>
          )}
        </div>
        {collection.description && (
          <p className="text-sm text-zinc-400 line-clamp-2">{collection.description}</p>
        )}
        <div className="flex flex-wrap gap-1 pt-2">
          <Link href={`/collections/${collection.id}`} className="btn-ghost text-xs px-2 py-1">
            Open
          </Link>
          {onSetActive && (
            <button
              onClick={() => onSetActive(collection)}
              className="btn-ghost text-xs px-2 py-1 text-gold"
            >
              Send to display
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(collection)} className="btn-ghost text-xs px-2 py-1">
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(collection)}
              className="btn-ghost text-xs px-2 py-1 text-red-400 ml-auto"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
