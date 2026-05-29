"use client";

import { Display, Poster } from "@/types";

export default function DisplayPreview({
  display,
  poster
}: {
  display: Display;
  poster?: Poster | null;
}) {
  const fit = display.fit_mode === "contain" ? "object-contain" : "object-cover";
  return (
    <div className="card overflow-hidden">
      <div className="p-3 text-xs text-zinc-400 flex items-center justify-between border-b border-ink-700">
        <span>Preview · vertical 9:16</span>
        <span className="badge-gold">{display.fit_mode}</span>
      </div>
      <div className="bg-black p-4 flex items-center justify-center">
        <div className="relative w-full max-w-[260px] aspect-[9/16] bg-black border border-ink-700 rounded-xl overflow-hidden">
          {poster ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={poster.image_url}
                alt={poster.title}
                className={"absolute inset-0 w-full h-full " + fit}
              />
              {display.show_overlay && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 to-transparent text-white">
                  <p className="font-medium text-sm truncate">{poster.title}</p>
                  <p className="text-[10px] text-zinc-300 flex gap-1.5 mt-0.5">
                    {poster.year && <span>{poster.year}</span>}
                    {poster.rating && <span>· {poster.rating}</span>}
                    {poster.runtime && <span>· {poster.runtime}</span>}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs">
              No poster selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
